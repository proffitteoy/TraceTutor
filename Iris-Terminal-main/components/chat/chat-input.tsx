import { ChatbotUIContext } from "@/context/context"
import { getChatSummariesByWorkspaceId } from "@/db/chat-summaries"
import useHotkey from "@/lib/hooks/use-hotkey"
import { detectInputKeywords } from "@/lib/summaries/keywords"
import { buildKeywordSummaryPrompt } from "@/lib/summaries/summary-prompts"
import { extractStructuredKeywords } from "@/lib/summaries/summary-format"
import { cn } from "@/lib/utils"
import { ChatSummaryDetail } from "@/types"
import {
  IconBolt,
  IconCirclePlus,
  IconPlayerStopFilled,
  IconSend
} from "@tabler/icons-react"
import Image from "next/image"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { ChatCommandInput } from "./chat-command-input"
import { ChatFilesDisplay } from "./chat-files-display"
import { useChatHandler } from "./chat-hooks/use-chat-handler"
import { useChatHistoryHandler } from "./chat-hooks/use-chat-history"
import { usePromptAndCommand } from "./chat-hooks/use-prompt-and-command"
import { useSelectFileHandler } from "./chat-hooks/use-select-file-handler"

interface ChatInputProps {}

interface SummaryKeywordSource {
  summaryId: string
  chatTitle: string
  summary: string
  keywords: string[]
}

interface SummaryKeywordMatch {
  summaryId: string
  keyword: string
  chatTitle: string
  summary: string
}

interface PromptPreviewState {
  keyword: string
  chatTitle: string
  prompt: string
}

export const ChatInput: FC<ChatInputProps> = () => {
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const [isTyping, setIsTyping] = useState(false)
  const [summaryKeywordSources, setSummaryKeywordSources] = useState<
    SummaryKeywordSource[]
  >([])
  const [summaryKeywordMatches, setSummaryKeywordMatches] = useState<
    SummaryKeywordMatch[]
  >([])
  const [promptPreview, setPromptPreview] = useState<PromptPreviewState | null>(
    null
  )

  const {
    isAssistantPickerOpen,
    focusAssistant,
    setFocusAssistant,
    userInput,
    chatMessages,
    isGenerating,
    selectedPreset,
    selectedAssistant,
    selectedChat,
    focusPrompt,
    setFocusPrompt,
    focusFile,
    focusTool,
    setFocusTool,
    isToolPickerOpen,
    isPromptPickerOpen,
    setIsPromptPickerOpen,
    isFilePickerOpen,
    setFocusFile,
    selectedTools,
    setSelectedTools,
    assistantImages
  } = useContext(ChatbotUIContext)

  const {
    chatInputRef,
    handleSendMessage,
    handleStopMessage,
    handleFocusChatInput
  } = useChatHandler()

  const { handleInputChange } = usePromptAndCommand()
  const { filesToAccept, handleSelectDeviceFile } = useSelectFileHandler()

  const {
    setNewMessageContentToNextUserMessage,
    setNewMessageContentToPreviousUserMessage
  } = useChatHistoryHandler()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const chatStatus = selectedChat?.status || "active"
  const isChatLocked = selectedChat !== null && chatStatus !== "active"
  const isNewConversation = selectedChat === null && chatMessages.length === 0

  useEffect(() => {
    const timer = setTimeout(() => {
      handleFocusChatInput()
    }, 200)

    return () => clearTimeout(timer)
  }, [selectedPreset, selectedAssistant, handleFocusChatInput])

  useEffect(() => {
    getChatSummariesByWorkspaceId(undefined, false, 120)
      .then((summaries: ChatSummaryDetail[]) => {
        const normalized = summaries
          .map(summary => ({
            summaryId: summary.id,
            chatTitle: summary.chat_title,
            summary: summary.summary,
            keywords: extractStructuredKeywords(
              `${summary.chat_title}\n${summary.summary}`,
              3
            )
          }))
          .filter(item => item.keywords.length > 0)

        setSummaryKeywordSources(normalized)
      })
      .catch(() => {
        setSummaryKeywordSources([])
      })
  }, [])

  useEffect(() => {
    if (!isNewConversation || !userInput.trim()) {
      setSummaryKeywordMatches([])
      return
    }

    const matches: SummaryKeywordMatch[] = []

    for (const source of summaryKeywordSources) {
      const keywords = detectInputKeywords(userInput, source.keywords, 3)

      for (const keyword of keywords) {
        matches.push({
          summaryId: source.summaryId,
          keyword,
          chatTitle: source.chatTitle,
          summary: source.summary
        })
      }
    }

    const deduped = Array.from(
      new Map(
        matches.map(match => [`${match.summaryId}:${match.keyword}`, match])
      ).values()
    )

    setSummaryKeywordMatches(deduped.slice(0, 8))
  }, [isNewConversation, userInput, summaryKeywordSources])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isTyping && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      setIsPromptPickerOpen(false)
      handleSendMessage(userInput, chatMessages, false)
    }

    if (
      isPromptPickerOpen ||
      isFilePickerOpen ||
      isToolPickerOpen ||
      isAssistantPickerOpen
    ) {
      if (
        event.key === "Tab" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault()
        if (isPromptPickerOpen) setFocusPrompt(!focusPrompt)
        if (isFilePickerOpen) setFocusFile(!focusFile)
        if (isToolPickerOpen) setFocusTool(!focusTool)
        if (isAssistantPickerOpen) setFocusAssistant(!focusAssistant)
      }
    }

    if (event.key === "ArrowUp" && event.shiftKey && event.ctrlKey) {
      event.preventDefault()
      setNewMessageContentToPreviousUserMessage()
    }

    if (event.key === "ArrowDown" && event.shiftKey && event.ctrlKey) {
      event.preventDefault()
      setNewMessageContentToNextUserMessage()
    }
  }

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items
    for (const item of items) {
      if (item.type.indexOf("image") === 0) {
        const file = item.getAsFile()
        if (!file) return
        handleSelectDeviceFile(file)
      }
    }
  }

  const handleOpenKeywordPrompt = (match: SummaryKeywordMatch) => {
    setPromptPreview({
      keyword: match.keyword,
      chatTitle: match.chatTitle,
      prompt: buildKeywordSummaryPrompt(
        match.keyword,
        match.chatTitle,
        match.summary
      )
    })
  }

  return (
    <>
      <div className="flex flex-col flex-wrap justify-center gap-2">
        <ChatFilesDisplay />

        {selectedTools &&
          selectedTools.map((tool, index) => (
            <div
              key={index}
              className="flex justify-center"
              onClick={() =>
                setSelectedTools(
                  selectedTools.filter(
                    selectedTool => selectedTool.id !== tool.id
                  )
                )
              }
            >
              <div className="flex cursor-pointer items-center justify-center space-x-1 rounded-lg bg-purple-600 px-3 py-1 hover:opacity-50">
                <IconBolt size={20} />
                <div>{tool.name}</div>
              </div>
            </div>
          ))}

        {selectedAssistant && (
          <div className="border-primary mx-auto flex w-fit items-center space-x-2 rounded-lg border p-1.5">
            {selectedAssistant.image_path && (
              <Image
                className="rounded"
                src={
                  assistantImages.find(
                    img => img.path === selectedAssistant.image_path
                  )?.base64
                }
                width={28}
                height={28}
                alt={selectedAssistant.name}
              />
            )}

            <div className="text-sm font-bold">
              {"\u52a9\u624b\uff1a"}
              {selectedAssistant.name}
            </div>
          </div>
        )}

        {isNewConversation && summaryKeywordMatches.length > 0 && (
          <div className="border-primary/30 bg-primary/5 mx-auto w-full rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">
              {
                "\u68c0\u6d4b\u5230\u4f60\u8f93\u5165\u4e86\u5386\u53f2\u603b\u7ed3\u5173\u952e\u8bcd\uff0c\u53ef\u4e00\u952e\u751f\u6210\u53ef\u590d\u7528 Prompt\u3002"
              }
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {summaryKeywordMatches.map(match => (
                <Button
                  key={`${match.summaryId}-${match.keyword}`}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleOpenKeywordPrompt(match)}
                >
                  {match.keyword} {"\u00b7"} {match.chatTitle}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-input relative mt-3 flex min-h-[60px] w-full items-center justify-center rounded-xl border-2">
        <div className="absolute bottom-[76px] left-0 max-h-[300px] w-full overflow-auto rounded-xl dark:border-none">
          <ChatCommandInput />
        </div>

        <IconCirclePlus
          className={cn(
            "absolute bottom-[12px] left-3 p-1",
            isChatLocked
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:opacity-50"
          )}
          size={32}
          onClick={() => {
            if (isChatLocked) return
            fileInputRef.current?.click()
          }}
        />

        <Input
          ref={fileInputRef}
          className="hidden"
          type="file"
          onChange={e => {
            if (!e.target.files) return
            handleSelectDeviceFile(e.target.files[0])
          }}
          accept={filesToAccept}
        />

        <TextareaAutosize
          textareaRef={chatInputRef}
          className="ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring text-md flex w-full resize-none rounded-md border-none bg-transparent px-14 py-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={
            isChatLocked
              ? chatStatus === "ended"
                ? "\u5f53\u524d\u5bf9\u8bdd\u5df2\u7ed3\u675f\uff0c\u8bf7\u65b0\u5efa\u5bf9\u8bdd\u540e\u7ee7\u7eed\u3002"
                : "\u5f53\u524d\u5bf9\u8bdd\u5df2\u6302\u8d77\uff0c\u8bf7\u6062\u590d\u540e\u7ee7\u7eed\u3002"
              : "\u8f93\u5165\u6d88\u606f\uff0c\u652f\u6301 / \u6307\u4ee4\u3001@ \u52a9\u624b\u3001+ \u6587\u4ef6"
          }
          onValueChange={handleInputChange}
          value={userInput}
          minRows={1}
          maxRows={18}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => setIsTyping(true)}
          onCompositionEnd={() => setIsTyping(false)}
          disabled={isChatLocked}
        />

        <div className="absolute bottom-[14px] right-3 cursor-pointer hover:opacity-50">
          {isGenerating ? (
            <IconPlayerStopFilled
              className="hover:bg-background animate-pulse rounded bg-transparent p-1"
              onClick={handleStopMessage}
              size={30}
            />
          ) : (
            <IconSend
              className={cn(
                "bg-primary text-secondary rounded p-1",
                (!userInput || isChatLocked) && "cursor-not-allowed opacity-50"
              )}
              onClick={() => {
                if (!userInput || isChatLocked) return
                handleSendMessage(userInput, chatMessages, false)
              }}
              size={30}
            />
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(promptPreview)}
        onOpenChange={open => {
          if (!open) setPromptPreview(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {"\u5173\u952e\u8bcd Prompt\uff1a"}
              {promptPreview?.keyword || ""}
            </DialogTitle>
          </DialogHeader>

          <div className="text-muted-foreground text-xs">
            {"\u6765\u6e90\u5bf9\u8bdd\uff1a"}
            {promptPreview?.chatTitle || ""}
          </div>

          <pre className="bg-muted mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md p-3 text-xs leading-relaxed">
            {promptPreview?.prompt || ""}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  )
}
