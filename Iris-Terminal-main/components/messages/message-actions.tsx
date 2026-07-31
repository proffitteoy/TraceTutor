import { ChatbotUIContext } from "@/context/context"
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconGitBranch,
  IconRepeat
} from "@tabler/icons-react"
import { FC, useContext, useEffect, useState } from "react"
import { WithTooltip } from "../ui/with-tooltip"

export const MESSAGE_ICON_SIZE = 18
const actionClassName =
  "hover:bg-accent hover:text-accent-foreground flex size-8 items-center justify-center rounded-md"

interface MessageActionsProps {
  isAssistant: boolean
  isLast: boolean
  isEditing: boolean
  isHovering: boolean
  onCopy: () => void
  onEdit: () => void
  onRegenerate: () => void
  onBranch?: () => void
}

export const MessageActions: FC<MessageActionsProps> = ({
  isAssistant,
  isLast,
  isEditing,
  isHovering,
  onCopy,
  onEdit,
  onRegenerate,
  onBranch
}) => {
  const { isGenerating } = useContext(ChatbotUIContext)

  const [showCheckmark, setShowCheckmark] = useState(false)

  const handleCopy = () => {
    onCopy()
    setShowCheckmark(true)
  }

  useEffect(() => {
    if (showCheckmark) {
      const timer = setTimeout(() => {
        setShowCheckmark(false)
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [showCheckmark])

  return (isLast && isGenerating) || isEditing ? null : (
    <div className="text-muted-foreground flex items-center space-x-2">
      {onBranch && (isHovering || isLast) && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>从此处创建分支卡片</div>}
          trigger={
            <button
              type="button"
              aria-label="从此处创建分支卡片"
              className={actionClassName}
              onClick={onBranch}
            >
              <IconGitBranch size={MESSAGE_ICON_SIZE} />
            </button>
          }
        />
      )}

      {!isAssistant && isHovering && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>编辑</div>}
          trigger={
            <button
              type="button"
              aria-label="编辑消息"
              className={actionClassName}
              onClick={onEdit}
            >
              <IconEdit size={MESSAGE_ICON_SIZE} />
            </button>
          }
        />
      )}

      {(isHovering || isLast) && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>复制</div>}
          trigger={
            showCheckmark ? (
              <span
                className={actionClassName}
                aria-label="已复制"
                role="status"
              >
                <IconCheck size={MESSAGE_ICON_SIZE} />
              </span>
            ) : (
              <button
                type="button"
                aria-label="复制消息"
                className={actionClassName}
                onClick={handleCopy}
              >
                <IconCopy size={MESSAGE_ICON_SIZE} />
              </button>
            )
          }
        />
      )}

      {isLast && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>重新生成</div>}
          trigger={
            <button
              type="button"
              aria-label="重新生成"
              className={actionClassName}
              onClick={onRegenerate}
            >
              <IconRepeat size={MESSAGE_ICON_SIZE} />
            </button>
          }
        />
      )}

      {/* {1 > 0 && isAssistant && <MessageReplies />} */}
    </div>
  )
}
