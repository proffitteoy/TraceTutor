"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import {
  deleteChatSummary,
  getChatSummariesByWorkspaceId
} from "@/db/chat-summaries"
import { buildKeywordSummaryPrompt } from "@/lib/summaries/summary-prompts"
import { extractStructuredKeywords } from "@/lib/summaries/summary-format"
import { ChatSummaryDetail } from "@/types"
import { useParams, useRouter } from "next/navigation"
import { useContext, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

export default function MemoriesPage() {
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  const { selectedWorkspace, chats } = useContext(ChatbotUIContext)

  const [summaries, setSummaries] = useState<ChatSummaryDetail[]>([])
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(
    null
  )
  const [selectedKeyword, setSelectedKeyword] = useState("")

  useEffect(() => {
    getChatSummariesByWorkspaceId(undefined, false, 500).then(data => {
      setSummaries(data)
      if (data.length > 0) {
        setSelectedSummaryId(prev => prev || data[0].id)
      }
    })
  }, [selectedWorkspace?.id])

  useEffect(() => {
    if (summaries.length === 0) {
      setSelectedSummaryId(null)
      return
    }

    if (
      !selectedSummaryId ||
      !summaries.some(item => item.id === selectedSummaryId)
    ) {
      setSelectedSummaryId(summaries[0].id)
    }
  }, [summaries, selectedSummaryId])

  const selectedSummary = useMemo(() => {
    if (!selectedSummaryId) return null
    return summaries.find(item => item.id === selectedSummaryId) || null
  }, [selectedSummaryId, summaries])

  const selectedSummaryKeywords = useMemo(() => {
    if (!selectedSummary) return []
    return extractStructuredKeywords(
      `${selectedSummary.chat_title || ""}\n${selectedSummary.summary || ""}`,
      8
    )
  }, [selectedSummary])

  useEffect(() => {
    if (selectedSummaryKeywords.length === 0) {
      setSelectedKeyword("")
      return
    }

    if (
      !selectedKeyword ||
      !selectedSummaryKeywords.includes(selectedKeyword)
    ) {
      setSelectedKeyword(selectedSummaryKeywords[0])
    }
  }, [selectedSummaryKeywords, selectedKeyword])

  const selectedPrompt = useMemo(() => {
    if (!selectedSummary || !selectedKeyword) return ""
    return buildKeywordSummaryPrompt(
      selectedKeyword,
      selectedSummary.chat_title || "未命名对话",
      selectedSummary.summary || ""
    )
  }, [selectedSummary, selectedKeyword])

  const handleOpenChat = (chatId: string, workspaceId?: string) => {
    const targetWorkspaceId = workspaceId || selectedWorkspace?.id
    if (!targetWorkspaceId) return
    router.push(`/${locale}/${targetWorkspaceId}/chat/${chatId}`)
  }

  const handleDeleteSummary = async (summaryId: string) => {
    const confirmed = window.confirm("确认删除这条总结吗？")
    if (!confirmed) return

    try {
      await deleteChatSummary(summaryId)
      setSummaries(prev => prev.filter(item => item.id !== summaryId))
      if (selectedSummaryId === summaryId) {
        setSelectedSummaryId(null)
      }
      toast.success("总结已删除")
    } catch (error: any) {
      toast.error(error?.message || "删除总结失败")
    }
  }

  return (
    <div className="flex size-full flex-col p-6">
      <div className="mb-4">
        <div className="text-2xl font-bold">记忆与总结</div>
        <div className="text-muted-foreground mt-1 text-sm">
          已支持跨项目互通检索。侧边仅显示标题和关键词，正文与 Prompt
          在右侧查看。
        </div>
      </div>

      <div className="mt-2 grid min-h-0 grow grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-h-0 space-y-3 overflow-auto pr-1">
          {summaries.length === 0 && (
            <div className="text-muted-foreground text-sm">暂无记录</div>
          )}

          {summaries.map(item => {
            const chatName =
              item.chat_title ||
              chats.find(chat => chat.id === item.chat_id)?.name ||
              "对话"
            const keywords = extractStructuredKeywords(
              `${chatName}\n${item.summary}`,
              4
            )

            return (
              <div
                key={`${item.id}-${item.chat_id}`}
                className={`rounded-lg border p-4 ${selectedSummaryId === item.id ? "border-primary" : "hover:bg-accent"}`}
                onClick={() => setSelectedSummaryId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-semibold">{chatName}</div>
                  <div className="text-muted-foreground shrink-0 text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-muted-foreground mt-1 text-xs">
                  项目：{item.workspace_name || "默认项目"}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {keywords.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                      无关键词
                    </span>
                  )}
                  {keywords.map(keyword => (
                    <Badge key={`${item.id}-${keyword}`} variant="outline">
                      {keyword}
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={event => {
                      event.stopPropagation()
                      handleOpenChat(item.chat_id, item.workspace_id)
                    }}
                  >
                    打开对话
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={event => {
                      event.stopPropagation()
                      handleDeleteSummary(item.id)
                    }}
                  >
                    删除总结
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="min-h-0 overflow-auto rounded-lg border p-4">
          {!selectedSummary && (
            <div className="text-muted-foreground text-sm">
              请选择一条总结查看详情
            </div>
          )}

          {selectedSummary && (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold">
                  {selectedSummary.chat_title || "未命名对话"}
                </div>
                <div className="text-muted-foreground text-xs">
                  项目：{selectedSummary.workspace_name || "默认项目"}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">关键词</div>
                <div className="flex flex-wrap gap-2">
                  {selectedSummaryKeywords.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                      无关键词
                    </span>
                  )}
                  {selectedSummaryKeywords.map(keyword => (
                    <Button
                      key={`${selectedSummary.id}-${keyword}`}
                      size="sm"
                      variant={
                        selectedKeyword === keyword ? "default" : "outline"
                      }
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedKeyword(keyword)}
                    >
                      {keyword}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">总结正文</div>
                <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 text-xs leading-relaxed">
                  {selectedSummary.summary}
                </pre>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Prompt 预览</div>
                <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 text-xs leading-relaxed">
                  {selectedPrompt || "请先选择关键词"}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
