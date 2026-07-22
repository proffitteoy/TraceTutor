import {
  deleteChatSummary,
  getChatSummariesByWorkspaceId
} from "@/db/chat-summaries"
import { extractStructuredKeywords } from "@/lib/summaries/summary-format"
import { ChatSummaryDetail } from "@/types"
import { useParams, useRouter } from "next/navigation"
import { FC, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface SummaryWithKeywords extends ChatSummaryDetail {
  keywords: string[]
}

export const SidebarSummaries: FC = () => {
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SummaryWithKeywords[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const summaries = await getChatSummariesByWorkspaceId(
          undefined,
          false,
          200
        )
        const normalized = summaries.map(summary => ({
          ...summary,
          keywords: extractStructuredKeywords(
            `${summary.chat_title}\n${summary.summary}`,
            4
          )
        }))
        setItems(normalized)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleOpenChat = (chatId: string, workspaceId: string) => {
    router.push(`/${locale}/${workspaceId}/chat/${chatId}`)
  }

  const handleOpenMemories = (workspaceId: string) => {
    router.push(`/${locale}/${workspaceId}/memories`)
  }

  const handleDelete = async (summaryId: string) => {
    const confirmed = window.confirm(
      "\u786e\u8ba4\u5220\u9664\u8fd9\u6761\u603b\u7ed3\u5417\uff1f"
    )
    if (!confirmed) return

    try {
      await deleteChatSummary(summaryId)
      setItems(prev => prev.filter(item => item.id !== summaryId))
      toast.success("\u603b\u7ed3\u5df2\u5220\u9664")
    } catch (error: any) {
      toast.error(error?.message || "\u5220\u9664\u603b\u7ed3\u5931\u8d25")
    }
  }

  return (
    <div className="flex max-h-[calc(100%-50px)] grow flex-col">
      <div className="mt-3 flex-1 space-y-3 overflow-auto pr-1">
        {loading && (
          <div className="text-muted-foreground text-sm">
            {"\u6b63\u5728\u52a0\u8f7d\u603b\u7ed3..."}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-muted-foreground text-sm">
            {"\u6682\u65e0\u603b\u7ed3\u8bb0\u5f55"}
          </div>
        )}

        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {item.chat_title}
                </div>

                <div className="text-muted-foreground mt-1 text-xs">
                  {item.workspace_name || "\u9ed8\u8ba4\u9879\u76ee"} {"\u00b7"}{" "}
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>

              {item.status !== "completed" && (
                <Badge variant="secondary">{item.status}</Badge>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {item.keywords.length === 0 && (
                <span className="text-muted-foreground text-xs">
                  {"\u65e0\u5173\u952e\u8bcd"}
                </span>
              )}

              {item.keywords.map(keyword => (
                <Badge key={`${item.id}-${keyword}`} variant="outline">
                  {keyword}
                </Badge>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenMemories(item.workspace_id)}
              >
                {"\u67e5\u770b\u8be6\u60c5"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChat(item.chat_id, item.workspace_id)}
              >
                {"\u6253\u5f00\u5bf9\u8bdd"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                {"\u5220\u9664\u603b\u7ed3"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
