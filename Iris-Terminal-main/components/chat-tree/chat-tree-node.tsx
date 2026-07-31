"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CardRelation, ChatTreeCard } from "@/types"
import {
  IconArrowRight,
  IconGitBranch,
  IconPlus,
  IconTrash
} from "@tabler/icons-react"
import { Handle, NodeProps, Position } from "@xyflow/react"
import { FC } from "react"

export interface ChatTreeNodeData extends Record<string, unknown> {
  card: ChatTreeCard
  active: boolean
  onActivate: (cardId: string) => void
  onCreate: (
    sourceCard: ChatTreeCard,
    relation: Exclude<CardRelation, "root">
  ) => void
  onDelete: (card: ChatTreeCard) => void
}

const getRelationLabel = (relation: string) => {
  switch (relation) {
    case "child":
      return "深入子卡片"
    case "divergent":
      return "同级发散卡片"
    case "branch":
      return "历史分支卡片"
    default:
      return "根卡片"
  }
}

export const ChatTreeNode: FC<NodeProps> = ({ data }) => {
  const { card, active, onActivate, onCreate, onDelete } =
    data as ChatTreeNodeData

  return (
    <div
      className={cn(
        "border-border bg-card/90 text-card-foreground flex h-[184px] w-[360px] flex-col overflow-hidden rounded-xl border-2 shadow-md backdrop-blur-md transition-[border-color,box-shadow]",
        active
          ? "border-primary/70 ring-primary/15 ring-4"
          : "hover:border-primary/40"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !size-2.5 !border-0"
      />

      <div
        className="chat-card-drag-handle bg-secondary flex min-h-12 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing"
        onClick={() => onActivate(card.id)}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{card.name}</div>
          <div className="text-muted-foreground text-[11px]">
            {getRelationLabel(card.card_relation)}
            {" · "}
            {card.message_count} 条消息
          </div>
        </div>

        <div
          className="nodrag flex items-center gap-1"
          onClick={event => event.stopPropagation()}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="创建深入子卡片"
            onClick={() => onCreate(card, "child")}
          >
            <IconPlus size={16} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="创建同级发散卡片"
            onClick={() => onCreate(card, "divergent")}
          >
            <IconArrowRight size={16} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="从最后一轮创建历史分支"
            disabled={card.message_count === 0}
            onClick={() => onCreate(card, "branch")}
          >
            <IconGitBranch size={16} />
          </Button>
          {card.card_relation !== "root" && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive size-8"
              title="删除卡片"
              onClick={() => onDelete(card)}
            >
              <IconTrash size={16} />
            </Button>
          )}
        </div>
      </div>

      <button
        type="button"
        className="nodrag flex min-h-0 flex-1 cursor-pointer flex-col items-start px-4 py-3 text-left"
        onClick={() => onActivate(card.id)}
      >
        {card.source_quote && (
          <div className="text-muted-foreground mb-2 line-clamp-2 text-xs italic">
            “{card.source_quote}”
          </div>
        )}
        <div className="line-clamp-2 text-sm leading-relaxed">
          {card.last_message?.content || "打开对话继续探索"}
        </div>
        <div className="text-muted-foreground mt-auto text-xs">
          {card.child_count} 个直接分支
        </div>
      </button>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !size-2.5 !border-0"
      />
    </div>
  )
}
