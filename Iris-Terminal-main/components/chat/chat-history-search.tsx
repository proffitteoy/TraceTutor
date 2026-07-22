"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ChatbotUIContext } from "@/context/context"
import { ChatSummaryMatch } from "@/types"
import { IconSearch } from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { useContext, useState } from "react"

export const ChatHistorySearch = () => {
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  const { selectedWorkspace, chats, chatSettings } =
    useContext(ChatbotUIContext)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ChatSummaryMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!selectedWorkspace || !query.trim()) return
    setIsSearching(true)

    try {
      const response = await fetch("/api/memory/retrieve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userInput: query,
          workspaceId: selectedWorkspace.id,
          embeddingsProvider:
            (chatSettings?.embeddingsProvider as "openai" | "local") ||
            "openai",
          matchCount: 6
        })
      })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as { results: ChatSummaryMatch[] }
      setResults(data.results || [])
    } finally {
      setIsSearching(false)
    }
  }

  const handleOpenChat = (chatId: string) => {
    if (!selectedWorkspace) return
    router.push(`/${locale}/${selectedWorkspace.id}/chat/${chatId}`)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="历史对话检索">
          <IconSearch size={20} />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>历史对话检索</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="输入关键词或问题..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                handleSearch()
              }
            }}
          />

          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? "检索中..." : "检索"}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {results.length === 0 && (
            <div className="text-muted-foreground text-sm">暂无匹配结果</div>
          )}

          {results.map(result => {
            const chatName =
              chats.find(chat => chat.id === result.chat_id)?.name || "对话"

            return (
              <button
                key={result.id}
                className="hover:bg-accent w-full rounded border p-3 text-left"
                onClick={() => handleOpenChat(result.chat_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{chatName}</div>
                  <div className="text-muted-foreground text-xs">
                    相似度 {(result.similarity * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-muted-foreground mt-2 text-sm">
                  {result.summary}
                </div>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
