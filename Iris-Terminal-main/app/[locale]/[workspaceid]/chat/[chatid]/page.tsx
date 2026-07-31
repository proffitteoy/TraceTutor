"use client"

import { ChatTreeUI } from "@/components/chat-tree/chat-tree-ui"
import { useParams } from "next/navigation"

export default function ChatIDPage() {
  const params = useParams()
  return <ChatTreeUI treeId={params.chatid as string} />
}
