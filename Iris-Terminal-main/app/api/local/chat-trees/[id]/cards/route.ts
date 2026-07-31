import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { prisma } from "@/lib/prisma"
import { CreateCardRequest } from "@/types"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

const CARD_RELATIONS = new Set(["child", "divergent", "branch"])
const MAX_BRANCH_CONTEXT_CHARS = 12000

const trimContext = (value: string) => {
  if (value.length <= MAX_BRANCH_CONTEXT_CHARS) return value
  return value.slice(value.length - MAX_BRANCH_CONTEXT_CHARS)
}

const buildBranchContext = (
  sourceName: string,
  sourceContext: string,
  relation: CreateCardRequest["relation"],
  quote?: string,
  sourceSummary?: string
) => {
  const relationLabel =
    relation === "child"
      ? "深入探索"
      : relation === "divergent"
        ? "相关发散"
        : "历史分支"

  const source = [
    `[${relationLabel}] 来源卡片：${sourceName}`,
    quote?.trim() ? `引用内容：\n${quote.trim()}` : "",
    sourceSummary?.trim() ? `来源摘要：\n${sourceSummary.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n")

  if (relation === "divergent") return trimContext(source)

  return trimContext(
    [source, sourceContext.trim()].filter(Boolean).join("\n\n")
  )
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await ensureLocalBootstrap()
  const input = (await request.json()) as CreateCardRequest

  if (!CARD_RELATIONS.has(input.relation)) {
    return new NextResponse("Invalid card relation", { status: 400 })
  }

  const source = await prisma.chat.findFirst({
    where: {
      id: input.source_chat_id,
      tree_id: params.id,
      user_id: user.id
    },
    include: {
      messages: {
        orderBy: { sequence_number: "asc" },
        include: { message_file_items: true }
      },
      chat_files: true
    }
  })

  if (!source) {
    return new NextResponse("Source card not found", { status: 404 })
  }

  const quote = input.source_quote?.trim() || null
  const selectedMessage = input.source_message_id
    ? source.messages.find(message => message.id === input.source_message_id)
    : null

  if (input.source_message_id) {
    if (!selectedMessage) {
      return new NextResponse("Source message does not belong to card", {
        status: 400
      })
    }
  }

  if (
    quote &&
    (input.relation !== "child" ||
      !selectedMessage ||
      selectedMessage.role !== "assistant" ||
      !Number.isInteger(input.selection_start) ||
      !Number.isInteger(input.selection_end) ||
      input.selection_start! < 0 ||
      input.selection_end! <= input.selection_start! ||
      quote.length > 8000)
  ) {
    return new NextResponse("Invalid quoted assistant selection", {
      status: 400
    })
  }

  if (!quote && input.source_message_id) {
    return new NextResponse("Source message requires a quote", { status: 400 })
  }

  const cardId = randomUUID()
  const relationIndex = await prisma.chat.count({
    where: {
      tree_id: source.tree_id,
      source_chat_id: source.id,
      card_relation: input.relation
    }
  })
  const defaultX =
    source.card_x +
    (input.relation === "branch" ? 0 : input.relation === "divergent" ? 0 : 420)
  const defaultY =
    source.card_y +
    (input.relation === "branch"
      ? 500 + relationIndex * 190
      : input.relation === "divergent"
        ? 220 + relationIndex * 190
        : relationIndex * 190)
  const namePrefix =
    input.relation === "child"
      ? "深入"
      : input.relation === "divergent"
        ? "发散"
        : "分支"
  const nameSource = quote || source.name
  const sourceSummary =
    [...source.messages].reverse().find(message => message.role === "assistant")
      ?.content ||
    source.messages[source.messages.length - 1]?.content ||
    ""
  const clippedSourceSummary = sourceSummary.trim().slice(0, 1200)
  const forkSequence =
    input.relation === "branch"
      ? Math.max(0, input.fork_sequence_number ?? source.messages.length)
      : null

  const created = await prisma.$transaction(async tx => {
    const chat = await tx.chat.create({
      data: {
        id: cardId,
        user_id: user.id,
        workspace_id: source.workspace_id,
        tree_id: source.tree_id,
        source_chat_id: source.id,
        source_message_id: input.source_message_id || null,
        assistant_id: source.assistant_id,
        folder_id: null,
        sharing: source.sharing,
        context_length: source.context_length,
        embeddings_provider: source.embeddings_provider,
        include_profile_context: source.include_profile_context,
        include_workspace_instructions: source.include_workspace_instructions,
        model: source.model,
        name: `${namePrefix}：${nameSource}`.slice(0, 100),
        prompt: source.prompt,
        temperature: source.temperature,
        status: "active",
        card_relation: input.relation,
        source_quote: quote,
        selection_start: input.selection_start ?? null,
        selection_end: input.selection_end ?? null,
        fork_sequence_number: forkSequence,
        branch_context: buildBranchContext(
          source.name,
          source.branch_context,
          input.relation,
          quote || undefined,
          clippedSourceSummary || undefined
        ),
        card_x: input.card_x ?? defaultX,
        card_y: input.card_y ?? defaultY
      }
    })

    if (source.chat_files.length > 0) {
      await tx.chatFile.createMany({
        data: source.chat_files.map(item => ({
          user_id: user.id,
          chat_id: chat.id,
          file_id: item.file_id
        })),
        skipDuplicates: true
      })
    }

    if (input.relation === "branch" && forkSequence !== null) {
      const inheritedMessages = source.messages.filter(
        message => message.sequence_number < forkSequence
      )

      for (const inherited of inheritedMessages) {
        const copied = await tx.message.create({
          data: {
            chat_id: chat.id,
            user_id: user.id,
            assistant_id: inherited.assistant_id,
            content: inherited.content,
            image_paths: inherited.image_paths,
            model: inherited.model,
            role: inherited.role,
            sequence_number: inherited.sequence_number
          }
        })

        if (inherited.message_file_items.length > 0) {
          await tx.messageFileItem.createMany({
            data: inherited.message_file_items.map(item => ({
              user_id: user.id,
              message_id: copied.id,
              file_item_id: item.file_item_id
            })),
            skipDuplicates: true
          })
        }
      }
    }

    return chat
  })

  return NextResponse.json(created, { status: 201 })
}
