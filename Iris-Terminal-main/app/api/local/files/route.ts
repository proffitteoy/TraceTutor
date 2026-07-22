import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { writeStorageFile } from "@/lib/local-storage"
import { prisma } from "@/lib/prisma"
import {
  processCSV,
  processDocX,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt,
  processXLSX
} from "@/lib/retrieval/processing"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { NextResponse } from "next/server"
import mammoth from "mammoth"
import OpenAI from "openai"

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-z0-9.]/gi, "_").toLowerCase()

const hasOpenAIEmbeddingKey = (
  profile: Awaited<ReturnType<typeof getServerProfile>>
) =>
  profile.use_azure_openai
    ? Boolean(
        profile.azure_openai_api_key && profile.azure_openai_embeddings_id
      )
    : Boolean(profile.openai_api_key)

export async function GET(request: Request) {
  await ensureLocalBootstrap()
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspace_id")
  const fileId = searchParams.get("file_id")

  if (fileId) {
    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file) {
      return new NextResponse("Not found", { status: 404 })
    }
    return NextResponse.json(file)
  }

  if (!workspaceId) {
    return new NextResponse("workspace_id is required", { status: 400 })
  }

  const fileWorkspaces = await prisma.fileWorkspace.findMany({
    where: { workspace_id: workspaceId },
    include: { file: true }
  })

  return NextResponse.json({
    files: fileWorkspaces.map(item => item.file)
  })
}

const createOpenAIEmbeddingClient = (
  profile: Awaited<ReturnType<typeof getServerProfile>>
) => {
  if (profile.use_azure_openai) {
    return new OpenAI({
      apiKey: profile.azure_openai_api_key || "",
      baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
      defaultQuery: { "api-version": "2023-12-01-preview" },
      defaultHeaders: { "api-key": profile.azure_openai_api_key }
    })
  }

  return new OpenAI({
    apiKey: profile.openai_api_key || "",
    organization: profile.openai_organization_id
  })
}

const processUploadedFile = async (
  fileName: string,
  arrayBuffer: ArrayBuffer,
  providedText: string | null
) => {
  const fileExtension = fileName.split(".").pop()?.toLowerCase()

  const blob = new Blob([Buffer.from(arrayBuffer)])

  switch (fileExtension) {
    case "docx": {
      const text =
        providedText ||
        (
          await mammoth.extractRawText({
            arrayBuffer
          })
        ).value

      return await processDocX(text)
    }
    case "doc":
      // Legacy .doc is parsed as plain text best-effort.
      return await processTxt(blob)
    case "csv":
      return await processCSV(blob)
    case "xls":
    case "xlsx":
      return await processXLSX(blob)
    case "xsl":
      return await processTxt(blob)
    case "json":
      return await processJSON(blob)
    case "md":
      return await processMarkdown(blob)
    case "pdf":
      return await processPdf(blob)
    case "txt":
    default:
      return await processTxt(blob)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await ensureLocalBootstrap()
    const profile = await getServerProfile()
    const formData = await request.formData()

    const file = formData.get("file") as File
    const workspaceId = formData.get("workspace_id") as string
    const requestedEmbeddingsProvider =
      (formData.get("embeddingsProvider") as "openai" | "local") || "openai"
    const providedText = formData.get("text") as string | null

    if (!file || !workspaceId) {
      return new NextResponse("Invalid upload payload", { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        user_id: user.id
      },
      select: { id: true }
    })

    if (!workspace) {
      return new NextResponse("Workspace not found", { status: 404 })
    }

    const safeName = sanitizeFilename(file.name)
    const extension =
      safeName.split(".").pop() || file.type.split("/")[1] || "txt"

    const createdFile = await prisma.file.create({
      data: {
        user_id: user.id,
        description: "",
        file_path: "",
        name: safeName,
        size: file.size,
        tokens: 0,
        type: extension
      }
    })

    await prisma.fileWorkspace.create({
      data: {
        user_id: user.id,
        file_id: createdFile.id,
        workspace_id: workspaceId
      }
    })

    const filePath = `${user.id}/${Buffer.from(createdFile.id).toString("base64")}/${safeName}`
    const arrayBuffer = await file.arrayBuffer()
    await writeStorageFile(`files/${filePath}`, Buffer.from(arrayBuffer))

    await prisma.file.update({
      where: { id: createdFile.id },
      data: { file_path: filePath }
    })

    const chunks = await processUploadedFile(
      safeName,
      arrayBuffer,
      providedText
    )
    const chunkContents = chunks.map(chunk => chunk.content)

    const warnings: string[] = []
    let usedEmbeddingsProvider: "openai" | "local" | "none" =
      requestedEmbeddingsProvider

    const availableOpenAIKey = hasOpenAIEmbeddingKey(profile)
    if (usedEmbeddingsProvider === "openai" && !availableOpenAIKey) {
      usedEmbeddingsProvider = "local"
      warnings.push(
        "\u672a\u68c0\u6d4b\u5230 OpenAI/Azure Embedding Key\uff0c\u5df2\u81ea\u52a8\u5207\u6362\u4e3a\u672c\u5730\u5411\u91cf\u3002"
      )
    }

    let embeddings: number[][] = []

    if (usedEmbeddingsProvider === "openai" && chunkContents.length > 0) {
      try {
        const openai = createOpenAIEmbeddingClient(profile)
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunkContents
        })
        embeddings = response.data.map(item => item.embedding as number[])
      } catch (error: any) {
        warnings.push(
          error?.error?.message ||
            error?.message ||
            "OpenAI \u5411\u91cf\u5316\u5931\u8d25\uff0c\u5df2\u5c1d\u8bd5\u5207\u6362\u5230\u672c\u5730\u5411\u91cf\u3002"
        )
        usedEmbeddingsProvider = "local"
      }
    }

    if (usedEmbeddingsProvider === "local" && chunkContents.length > 0) {
      try {
        embeddings = await Promise.all(
          chunkContents.map(
            async content => await generateLocalEmbedding(content)
          )
        )
      } catch (error: any) {
        warnings.push(
          error?.error?.message ||
            error?.message ||
            "\u672c\u5730\u5411\u91cf\u5316\u5931\u8d25\uff0c\u5df2\u4ec5\u4fdd\u5b58\u6587\u4ef6\u5185\u5bb9\u3002"
        )
        usedEmbeddingsProvider = "none"
        embeddings = []
      }
    }

    const fileItems = chunks.map((chunk, index) => ({
      file_id: createdFile.id,
      user_id: user.id,
      content: chunk.content,
      tokens: chunk.tokens,
      openai_embedding:
        usedEmbeddingsProvider === "openai" && embeddings[index]
          ? (embeddings[index] as any)
          : null,
      local_embedding:
        usedEmbeddingsProvider === "local" && embeddings[index]
          ? (embeddings[index] as any)
          : null
    }))

    if (fileItems.length > 0) {
      await prisma.fileItem.createMany({
        data: fileItems
      })
    }

    const totalTokens = fileItems.reduce((acc, item) => acc + item.tokens, 0)

    const updatedFile = await prisma.file.update({
      where: { id: createdFile.id },
      data: { tokens: totalTokens, file_path: filePath }
    })

    return NextResponse.json({
      ...updatedFile,
      embeddings_provider_used: usedEmbeddingsProvider,
      warning: warnings.length > 0 ? warnings.join("；") : null
    })
  } catch (error: any) {
    const message =
      error?.error?.message ||
      error?.message ||
      "\u6587\u4ef6\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
    return NextResponse.json({ message }, { status: error?.status || 500 })
  }
}
