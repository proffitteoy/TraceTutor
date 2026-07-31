import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { writeStorageFile } from "@/lib/local-storage"
import { prisma } from "@/lib/prisma"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { FileItemChunk } from "@/types"
import { NextResponse } from "next/server"

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

const createOpenAIEmbeddingClient = async (
  profile: Awaited<ReturnType<typeof getServerProfile>>
) => {
  const { default: OpenAI } = await import("openai")

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
): Promise<FileItemChunk[]> => {
  const fileExtension = fileName.split(".").pop()?.toLowerCase()
  const blob = new Blob([Buffer.from(arrayBuffer)])

  switch (fileExtension) {
    case "docx": {
      const text =
        providedText ||
        (
          await (
            await import("mammoth")
          ).default.extractRawText({ arrayBuffer })
        ).value
      const { processDocX } = await import("@/lib/retrieval/processing/docx")
      return processDocX(text)
    }
    case "csv": {
      const { processCSV } = await import("@/lib/retrieval/processing/csv")
      return processCSV(blob)
    }
    case "xls":
    case "xlsx": {
      const { processXLSX } = await import("@/lib/retrieval/processing/xlsx")
      return processXLSX(blob)
    }
    case "json": {
      const { processJSON } = await import("@/lib/retrieval/processing/json")
      return processJSON(blob)
    }
    case "md": {
      const { processMarkdown } = await import("@/lib/retrieval/processing/md")
      return processMarkdown(blob)
    }
    case "pdf": {
      const { processPdf } = await import("@/lib/retrieval/processing/pdf")
      return processPdf(blob)
    }
    case "doc":
    case "xsl":
    case "txt":
    default: {
      const { processTxt } = await import("@/lib/retrieval/processing/txt")
      return processTxt(blob)
    }
  }
}

export const handleFileUpload = async (request: Request) => {
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

    if (
      usedEmbeddingsProvider === "openai" &&
      !hasOpenAIEmbeddingKey(profile)
    ) {
      usedEmbeddingsProvider = "local"
      warnings.push(
        "未检测到 OpenAI/Azure Embedding Key，已自动切换为本地向量。"
      )
    }

    let embeddings: number[][] = []

    if (usedEmbeddingsProvider === "openai" && chunkContents.length > 0) {
      try {
        const openai = await createOpenAIEmbeddingClient(profile)
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunkContents
        })
        embeddings = response.data.map(item => item.embedding as number[])
      } catch (error: any) {
        warnings.push(
          error?.error?.message ||
            error?.message ||
            "OpenAI 向量化失败，已尝试切换到本地向量。"
        )
        usedEmbeddingsProvider = "local"
      }
    }

    if (usedEmbeddingsProvider === "local" && chunkContents.length > 0) {
      try {
        const { generateLocalEmbedding } = await import(
          "@/lib/generate-local-embedding"
        )
        embeddings = await Promise.all(
          chunkContents.map(content => generateLocalEmbedding(content))
        )
      } catch (error: any) {
        warnings.push(
          error?.error?.message ||
            error?.message ||
            "本地向量化失败，已仅保存文件内容。"
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
      await prisma.fileItem.createMany({ data: fileItems })
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
      "文件上传失败，请稍后重试。"
    return NextResponse.json({ message }, { status: error?.status || 500 })
  }
}
