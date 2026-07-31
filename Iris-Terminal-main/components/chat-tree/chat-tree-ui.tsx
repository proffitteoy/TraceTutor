"use client"

import Loading from "@/app/[locale]/loading"
import { ChatUI } from "@/components/chat/chat-ui"
import { MessageMarkdown } from "@/components/messages/message-markdown"
import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import { cn } from "@/lib/utils"
import {
  createChatTreeCard,
  deleteChatTreeCard,
  getChatTree,
  updateChatTreeCard
} from "@/db/chat-trees"
import {
  CardRelation,
  ChatTreeCard,
  ChatTreeResponse,
  CreateCardRequest
} from "@/types"
import { Tables } from "@/types/database"
import {
  IconHierarchy2,
  IconMessagePlus,
  IconMessages,
  IconX
} from "@tabler/icons-react"
import {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node as FlowNode,
  ReactFlow,
  ReactFlowInstance,
  useEdgesState,
  useNodesState
} from "@xyflow/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  MouseEvent as ReactMouseEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { toast } from "sonner"
import { ChatTreeNode, ChatTreeNodeData } from "./chat-tree-node"

interface ChatTreeUIProps {
  treeId: string
}

type ChatTreeView = "chat" | "canvas"

interface PendingAsk {
  x: number
  y: number
  sourceChatId: string
  sourceMessageId: string
  quote: string
  selectionStart: number
  selectionEnd: number
}

interface SourceSelection {
  quote: string
  start: number
  end: number
}

interface MathSourceSpan extends SourceSelection {
  expression: string
}

const nodeTypes = { chatCard: ChatTreeNode }
const MATH_SOURCE_PATTERN =
  /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$\n])+?\$/g
const CODE_SOURCE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/g
const CONTEXT_LENGTH = 96

const getMessageElement = (node: Node | null) => {
  const element =
    node?.nodeType === window.Node.ELEMENT_NODE
      ? (node as Element)
      : node?.parentElement
  return element?.closest<HTMLElement>("[data-message-id]") || null
}

const isInsideUnsupportedSelection = (node: Node | null) => {
  const element =
    node?.nodeType === window.Node.ELEMENT_NODE
      ? (node as Element)
      : node?.parentElement
  return Boolean(element?.closest("pre, code, img"))
}

const normalizeContext = (value: string) => value.replace(/\s+/g, " ").trim()

const normalizeTex = (value: string) => value.replace(/\s+/g, "")

const toComparableMarkdownText = (value: string) =>
  normalizeContext(
    value
      .replace(CODE_SOURCE_PATTERN, " ")
      .replace(MATH_SOURCE_PATTERN, " ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_~>#`]/g, " ")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, " ")
  )

const getVisibleFragmentText = (fragment: DocumentFragment) => {
  fragment
    .querySelectorAll(".katex, pre, code, img, script, style")
    .forEach(element => element.remove())
  return normalizeContext(fragment.textContent || "")
}

const getTextAroundBoundary = (
  contentRoot: HTMLElement,
  boundary: Range | HTMLElement,
  side: "before" | "after"
) => {
  const contextRange = document.createRange()
  contextRange.selectNodeContents(contentRoot)

  if (boundary instanceof Range) {
    if (side === "before") {
      contextRange.setEnd(boundary.startContainer, boundary.startOffset)
    } else {
      contextRange.setStart(boundary.endContainer, boundary.endOffset)
    }
  } else if (side === "before") {
    contextRange.setEndBefore(boundary)
  } else {
    contextRange.setStartAfter(boundary)
  }

  const text = getVisibleFragmentText(contextRange.cloneContents())
  return side === "before"
    ? text.slice(-CONTEXT_LENGTH)
    : text.slice(0, CONTEXT_LENGTH)
}

const commonPrefixLength = (left: string, right: string) => {
  const length = Math.min(left.length, right.length)
  let index = 0
  while (index < length && left[index] === right[index]) index += 1
  return index
}

const commonSuffixLength = (left: string, right: string) =>
  commonPrefixLength(
    [...left].reverse().join(""),
    [...right].reverse().join("")
  )

const getMathSourceSpans = (source: string): MathSourceSpan[] => {
  const codeRanges: { start: number; end: number }[] = []
  for (const match of source.matchAll(CODE_SOURCE_PATTERN)) {
    codeRanges.push({
      start: match.index || 0,
      end: (match.index || 0) + match[0].length
    })
  }

  const spans: MathSourceSpan[] = []
  for (const match of source.matchAll(MATH_SOURCE_PATTERN)) {
    const start = match.index || 0
    const end = start + match[0].length
    if (codeRanges.some(range => start >= range.start && end <= range.end)) {
      continue
    }

    const raw = match[0]
    const delimiterLength = raw.startsWith("$$") || raw.startsWith("\\") ? 2 : 1
    spans.push({
      quote: raw,
      start,
      end,
      expression: raw.slice(delimiterLength, -delimiterLength).trim()
    })
  }

  return spans
}

const getContextMatchScore = (
  source: string,
  span: SourceSelection,
  leftContext: string,
  rightContext: string
) => {
  const sourceLeft = toComparableMarkdownText(
    source.slice(0, span.start)
  ).slice(-CONTEXT_LENGTH)
  const sourceRight = toComparableMarkdownText(source.slice(span.end)).slice(
    0,
    CONTEXT_LENGTH
  )

  return (
    commonSuffixLength(sourceLeft, leftContext) +
    commonPrefixLength(sourceRight, rightContext)
  )
}

const resolveMathSelection = (
  contentRoot: HTMLElement,
  range: Range,
  source: string
): SourceSelection | null => {
  const selectedMath = Array.from(
    contentRoot.querySelectorAll<HTMLElement>("[data-math-source-start]")
  )
    .filter(element => {
      try {
        return range.intersectsNode(element)
      } catch {
        return false
      }
    })
    .sort((left, right) =>
      left.compareDocumentPosition(right) &
      window.Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
    )

  if (selectedMath.length === 0) return null

  const sourceSpans = getMathSourceSpans(source)
  if (sourceSpans.length === 0) return null

  const resolved: { element: HTMLElement; span: MathSourceSpan }[] = []
  let minimumSourceIndex = 0

  for (const mathElement of selectedMath) {
    const annotation =
      mathElement.dataset.mathTex ||
      mathElement.querySelector("annotation[encoding='application/x-tex']")
        ?.textContent ||
      ""
    const normalizedAnnotation = normalizeTex(annotation)
    const normalizedStart = Number(mathElement.dataset.mathSourceStart)
    const normalizedEnd = Number(mathElement.dataset.mathSourceEnd)
    const mathIndex = Number(mathElement.dataset.mathIndex)
    const leftContext = getTextAroundBoundary(
      contentRoot,
      mathElement,
      "before"
    )
    const rightContext = getTextAroundBoundary(
      contentRoot,
      mathElement,
      "after"
    )

    let best:
      | { span: MathSourceSpan; sourceIndex: number; score: number }
      | undefined

    const positionedSourceIndex = sourceSpans.findIndex(
      span =>
        span.start === normalizedStart &&
        span.end === normalizedEnd &&
        (!normalizedAnnotation ||
          normalizeTex(span.expression) === normalizedAnnotation)
    )
    if (positionedSourceIndex >= minimumSourceIndex) {
      best = {
        span: sourceSpans[positionedSourceIndex],
        sourceIndex: positionedSourceIndex,
        score: Number.MAX_SAFE_INTEGER
      }
    }

    if (
      !best &&
      Number.isInteger(mathIndex) &&
      mathIndex >= minimumSourceIndex &&
      mathIndex < sourceSpans.length
    ) {
      const indexedSpan = sourceSpans[mathIndex]
      if (
        !normalizedAnnotation ||
        normalizeTex(indexedSpan.expression) === normalizedAnnotation
      ) {
        best = {
          span: indexedSpan,
          sourceIndex: mathIndex,
          score: Number.MAX_SAFE_INTEGER - 1
        }
      }
    }

    sourceSpans.forEach((span, sourceIndex) => {
      if (best?.score === Number.MAX_SAFE_INTEGER) return
      if (sourceIndex < minimumSourceIndex) return
      const expressionMatches =
        !normalizedAnnotation ||
        normalizeTex(span.expression) === normalizedAnnotation
      if (!expressionMatches) return

      const score =
        (normalizedAnnotation ? 1000 : 0) +
        getContextMatchScore(source, span, leftContext, rightContext)
      if (!best || score > best.score) {
        best = { span, sourceIndex, score }
      }
    })

    if (!best) return null
    resolved.push({ element: mathElement, span: best.span })
    minimumSourceIndex = best.sourceIndex + 1
  }

  const first = resolved[0]
  const last = resolved[resolved.length - 1]
  let start = first.span.start
  let end = last.span.end

  const leadingRange = range.cloneRange()
  leadingRange.setEndBefore(first.element)
  const leadingText = leadingRange.toString().trim()
  if (leadingText) {
    const leadingStart = source.lastIndexOf(leadingText, start)
    if (
      leadingStart >= 0 &&
      leadingStart + leadingText.length <= first.span.start
    ) {
      start = leadingStart
    }
  }

  const trailingRange = range.cloneRange()
  trailingRange.setStartAfter(last.element)
  const trailingText = trailingRange.toString().trim()
  if (trailingText) {
    const trailingStart = source.indexOf(trailingText, end)
    if (trailingStart >= last.span.end) {
      end = trailingStart + trailingText.length
    }
  }

  return {
    quote: source.slice(start, end),
    start,
    end
  }
}

const resolvePlainSelection = (
  contentRoot: HTMLElement,
  range: Range,
  source: string,
  rawSelection: string
): SourceSelection | null => {
  const quote = rawSelection.trim()
  if (!quote) return null

  const leftContext = getTextAroundBoundary(contentRoot, range, "before")
  const rightContext = getTextAroundBoundary(contentRoot, range, "after")
  const occurrences: SourceSelection[] = []
  let searchFrom = 0

  while (searchFrom <= source.length) {
    const start = source.indexOf(quote, searchFrom)
    if (start === -1) break
    occurrences.push({ quote, start, end: start + quote.length })
    searchFrom = start + Math.max(1, quote.length)
  }

  if (occurrences.length === 0) return null
  return occurrences.sort(
    (left, right) =>
      getContextMatchScore(source, right, leftContext, rightContext) -
      getContextMatchScore(source, left, leftContext, rightContext)
  )[0]
}

const extractSelection = (
  event: ReactMouseEvent,
  card: ChatTreeCard,
  sourceContent?: string
): PendingAsk | null => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startMessage = getMessageElement(range.startContainer)
  const endMessage = getMessageElement(range.endContainer)
  const eventMessage = (event.target as Element).closest<HTMLElement>(
    "[data-message-id]"
  )

  if (
    !startMessage ||
    startMessage !== endMessage ||
    startMessage !== eventMessage ||
    startMessage.dataset.messageRole !== "assistant"
  ) {
    return null
  }

  const contentRoot = startMessage.querySelector<HTMLElement>(
    "[data-message-body]"
  )
  if (
    !contentRoot ||
    !contentRoot.contains(range.startContainer) ||
    !contentRoot.contains(range.endContainer) ||
    isInsideUnsupportedSelection(range.startContainer) ||
    isInsideUnsupportedSelection(range.endContainer)
  ) {
    return null
  }

  const fragment = range.cloneContents()
  if (fragment.querySelector("pre, code, img")) return null

  const rawSelection = selection.toString()
  const sourceSelection = sourceContent
    ? resolveMathSelection(contentRoot, range, sourceContent) ||
      resolvePlainSelection(contentRoot, range, sourceContent, rawSelection)
    : null
  const quote = sourceSelection?.quote || rawSelection.trim()
  if (!quote) return null

  const before = document.createRange()
  before.selectNodeContents(contentRoot)
  before.setEnd(range.startContainer, range.startOffset)
  const leadingWhitespace =
    rawSelection.length - rawSelection.trimStart().length
  const selectionStart =
    sourceSelection?.start ?? before.toString().length + leadingWhitespace

  return {
    x: event.clientX,
    y: event.clientY,
    sourceChatId: card.id,
    sourceMessageId: startMessage.dataset.messageId || "",
    quote,
    selectionStart,
    selectionEnd: sourceSelection?.end ?? selectionStart + quote.length
  }
}

export const ChatTreeUI = ({ treeId }: ChatTreeUIProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedCardId = searchParams.get("card")
  const requestedView: ChatTreeView =
    searchParams.get("view") === "canvas" ? "canvas" : "chat"
  const { chatMessages, isGenerating, setUserInput } =
    useContext(ChatbotUIContext)

  const [tree, setTree] = useState<ChatTreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCardId, setActiveCardId] = useState(requestedCardId || treeId)
  const [view, setView] = useState<ChatTreeView>(requestedView)
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)
  const [flow, setFlow] = useState<ReactFlowInstance<
    FlowNode<ChatTreeNodeData>,
    Edge
  > | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<
    FlowNode<ChatTreeNodeData>
  >([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const lastMessageSignature = useRef("")

  const setActiveView = useCallback(
    (nextView: ChatTreeView) => {
      setView(nextView)
      const next = new URLSearchParams(searchParams.toString())
      if (nextView === "canvas") {
        next.set("view", "canvas")
      } else {
        next.delete("view")
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const setActiveCard = useCallback(
    (cardId: string) => {
      setActiveCardId(cardId)
      setUserInput("")
      const next = new URLSearchParams(searchParams.toString())
      next.set("card", cardId)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      window.setTimeout(() => {
        flow?.fitView({
          nodes: [{ id: cardId }],
          duration: 300,
          padding: 0.18,
          maxZoom: 1
        })
      }, 50)
    },
    [flow, pathname, router, searchParams, setUserInput]
  )

  const loadTree = useCallback(async () => {
    const loaded = await getChatTree(treeId)
    setTree(loaded)

    const root = loaded.cards.find(card => card.card_relation === "root")
    const requestedExists = loaded.cards.some(card => card.id === activeCardId)
    if (!requestedExists && root) setActiveCard(root.id)
    return loaded
  }, [activeCardId, setActiveCard, treeId])

  useEffect(() => {
    setView(requestedView)
  }, [requestedView])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getChatTree(treeId)
      .then(loaded => {
        if (cancelled) return
        setTree(loaded)
        const requested = requestedCardId
          ? loaded.cards.find(card => card.id === requestedCardId)
          : null
        const root = loaded.cards.find(card => card.card_relation === "root")
        setActiveCardId(requested?.id || root?.id || treeId)
      })
      .catch(() => toast.error("卡片树加载失败"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [requestedCardId, treeId])

  const createCard = useCallback(
    async (
      source: ChatTreeCard,
      relation: Exclude<CardRelation, "root">,
      selection?: PendingAsk,
      forkSequenceNumber?: number,
      draftInput?: string
    ) => {
      const input: CreateCardRequest = {
        source_chat_id: source.id,
        relation,
        source_message_id: selection?.sourceMessageId,
        source_quote: selection?.quote,
        selection_start: selection?.selectionStart,
        selection_end: selection?.selectionEnd,
        fork_sequence_number:
          relation === "branch"
            ? forkSequenceNumber ??
              Math.max(
                0,
                source.message_count - (source.message_count % 2 || 2)
              )
            : undefined
      }

      try {
        const created = await createChatTreeCard(treeId, input)
        const loaded = await getChatTree(treeId)
        setTree(loaded)
        setPendingAsk(null)
        window.getSelection()?.removeAllRanges()
        setActiveCard(created.id)
        window.setTimeout(() => setUserInput(draftInput || ""), 0)
      } catch {
        toast.error("新建分支卡片失败")
      }
    },
    [setActiveCard, setUserInput, treeId]
  )

  const handleCreate = useCallback(
    (source: ChatTreeCard, relation: Exclude<CardRelation, "root">) => {
      if (relation === "branch" && source.id === activeCardId) {
        const lastUserMessage = [...chatMessages]
          .reverse()
          .find(item => item.message.role === "user")?.message
        createCard(
          source,
          relation,
          undefined,
          lastUserMessage?.sequence_number,
          lastUserMessage?.content
        )
        return
      }
      createCard(source, relation)
    },
    [activeCardId, chatMessages, createCard]
  )

  const handleBranchFromMessage = useCallback(
    (message: Tables<"messages">) => {
      const source = tree?.cards.find(card => card.id === activeCardId)
      if (!source) return

      if (message.role === "assistant") {
        createCard(
          source,
          "branch",
          undefined,
          message.sequence_number + 1
        )
        return
      }

      createCard(
        source,
        "branch",
        undefined,
        message.sequence_number,
        message.content
      )
    },
    [activeCardId, createCard, tree]
  )

  const handleDelete = useCallback(
    async (card: ChatTreeCard) => {
      const hasChildren = card.child_count > 0
      const confirmed = window.confirm(
        hasChildren
          ? `“${card.name}”还有后续分支。确认删除整个子树吗？`
          : `确认删除卡片“${card.name}”吗？`
      )
      if (!confirmed) return

      try {
        const result = await deleteChatTreeCard(treeId, card.id, hasChildren)
        if ("requiresSubtreeConfirmation" in result) return
        const loaded = await getChatTree(treeId)
        setTree(loaded)
        setActiveCard(card.source_chat_id || treeId)
      } catch {
        toast.error("删除卡片失败")
      }
    },
    [setActiveCard, treeId]
  )

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent, card: ChatTreeCard) => {
      const messageElement = getMessageElement(event.target as Node)
      const sourceContent = chatMessages.find(
        item => item.message.id === messageElement?.dataset.messageId
      )?.message.content
      const selection = extractSelection(event, card, sourceContent)
      if (!selection) return
      event.preventDefault()
      event.stopPropagation()
      setPendingAsk(selection)
    },
    [chatMessages]
  )

  const handleJumpToSource = useCallback(
    (card: ChatTreeCard) => {
      if (!card.source_chat_id || !card.source_message_id) return
      setActiveCard(card.source_chat_id)
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(
            `[data-message-id="${card.source_message_id}"]`
          )
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 350)
    },
    [setActiveCard]
  )

  const cardNodes = useMemo<FlowNode<ChatTreeNodeData>[]>(
    () =>
      (tree?.cards || []).map(card => ({
        id: card.id,
        type: "chatCard",
        position: { x: card.card_x, y: card.card_y },
        dragHandle: ".chat-card-drag-handle",
        data: {
          card,
          active: card.id === activeCardId,
          onActivate: setActiveCard,
          onCreate: handleCreate,
          onDelete: handleDelete
        }
      })),
    [
      activeCardId,
      handleCreate,
      handleDelete,
      setActiveCard,
      tree
    ]
  )

  const cardEdges = useMemo<Edge[]>(
    () =>
      (tree?.cards || [])
        .filter(card => card.source_chat_id)
        .map(card => ({
          id: `${card.source_chat_id}-${card.id}`,
          source: card.source_chat_id!,
          target: card.id,
          animated: card.id === activeCardId,
          label:
            card.card_relation === "child"
              ? "深入"
              : card.card_relation === "divergent"
                ? "发散"
                : "分支",
          style: {
            strokeWidth: card.id === activeCardId ? 2 : 1.5
          }
        })),
    [activeCardId, tree]
  )

  useEffect(() => setNodes(cardNodes), [cardNodes, setNodes])
  useEffect(() => setEdges(cardEdges), [cardEdges, setEdges])

  useEffect(() => {
    if (isGenerating) return
    const last = chatMessages[chatMessages.length - 1]?.message
    const signature = `${activeCardId}:${chatMessages.length}:${last?.id || ""}:${last?.content?.length || 0}`
    if (!last || signature === lastMessageSignature.current) return
    lastMessageSignature.current = signature
    loadTree().catch(() => {})
  }, [activeCardId, chatMessages, isGenerating, loadTree])

  useEffect(() => {
    if (!pendingAsk) return
    const close = () => setPendingAsk(null)
    window.addEventListener("mousedown", close)
    window.addEventListener("blur", close)
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("blur", close)
    }
  }, [pendingAsk])

  if (loading || !tree) return <Loading />

  const askSource = tree.cards.find(
    card => card.id === pendingAsk?.sourceChatId
  )
  const activeCard = tree.cards.find(card => card.id === activeCardId)

  return (
    <div className="relative size-full overflow-hidden">
      <div className="border-border bg-background/85 absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md">
        <div
          className="bg-muted flex rounded-lg p-1"
          role="tablist"
          aria-label="对话与画布视图"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "chat"}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
              view === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveView("chat")}
          >
            <IconMessages size={16} />
            对话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "canvas"}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
              view === "canvas"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveView("canvas")}
          >
            <IconHierarchy2 size={16} />
            画布
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {activeCard?.name || "知识探索"}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {view === "chat"
              ? "阅读、框选并继续当前对话"
              : "滚轮缩放 · 拖动空白处移动 · Ctrl/⌘ + 滚轮保留浏览器缩放"}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-14">
        {view === "chat" && activeCard ? (
          <div className="flex size-full min-h-0 flex-col">
            {activeCard.source_quote && (
              <div className="border-primary/30 bg-primary/5 flex max-h-28 shrink-0 items-start gap-3 overflow-auto border-b px-4 py-3">
                <blockquote className="min-w-0 flex-1">
                  <MessageMarkdown
                    content={activeCard.source_quote}
                    className="prose-sm space-y-2 text-xs"
                  />
                </blockquote>
                {activeCard.source_message_id &&
                  activeCard.source_chat_id && (
                    <button
                      type="button"
                      className="text-primary shrink-0 text-xs hover:underline"
                      onClick={() => handleJumpToSource(activeCard)}
                    >
                      定位原文
                    </button>
                  )}
              </div>
            )}
            <div
              className="min-h-0 flex-1 cursor-text select-text"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
              onContextMenu={event => handleContextMenu(event, activeCard)}
            >
              <ChatUI
                chatIdOverride={activeCard.id}
                translucent
                onBranchFromMessage={handleBranchFromMessage}
              />
            </div>
          </div>
        ) : (
          <div
            className="bg-background/70 size-full"
            onWheelCapture={event => {
              if (event.ctrlKey || event.metaKey) event.stopPropagation()
            }}
          >
            <ReactFlow<FlowNode<ChatTreeNodeData>, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onInit={setFlow}
              onNodeDragStop={(_, node) => {
                setTree(current =>
                  current
                    ? {
                        ...current,
                        cards: current.cards.map(card =>
                          card.id === node.id
                            ? {
                                ...card,
                                card_x: node.position.x,
                                card_y: node.position.y
                              }
                            : card
                        )
                      }
                    : current
                )
                updateChatTreeCard(treeId, node.id, {
                  card_x: node.position.x,
                  card_y: node.position.y
                }).catch(() => toast.error("卡片位置保存失败"))
              }}
              fitView
              fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={1.3}
              nodesDraggable
              nodesConnectable={false}
              nodesFocusable={false}
              elementsSelectable={false}
              panOnDrag
              selectionOnDrag={false}
              zoomOnDoubleClick={false}
            >
              <Background gap={28} size={1} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                className="!border-border !bg-background/90 !border"
              />
            </ReactFlow>
          </div>
        )}
      </div>

      {pendingAsk && askSource && (
        <div
          className="border-border bg-popover text-popover-foreground fixed z-[100] min-w-44 rounded-md border p-1 shadow-xl"
          style={{ left: pendingAsk.x, top: pendingAsk.y }}
          onMouseDown={event => event.stopPropagation()}
        >
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 rounded px-3 py-2 text-sm"
            onClick={() => createCard(askSource, "child", pendingAsk)}
          >
            <IconMessagePlus size={17} />
            Ask：创建深入卡片
          </button>
          <div className="text-muted-foreground max-w-72 truncate px-3 pb-2 text-xs">
            “{pendingAsk.quote}”
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 size-7"
            onClick={() => setPendingAsk(null)}
          >
            <IconX size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
