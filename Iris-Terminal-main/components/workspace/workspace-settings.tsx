import { ChatbotUIContext } from "@/context/context"
import { WORKSPACE_INSTRUCTIONS_MAX } from "@/db/limits"
import {
  getWorkspaceImageFromStorage,
  uploadWorkspaceImage
} from "@/db/storage/workspace-images"
import { updateWorkspace } from "@/db/workspaces"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import {
  DEFAULT_CHAT_CONTEXT_LENGTH,
  DEFAULT_CHAT_TEMPERATURE
} from "@/lib/default-chat-settings"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { LLMID } from "@/types"
import { IconHome, IconSettings } from "@tabler/icons-react"
import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  useContext,
  useEffect,
  useRef,
  useState
} from "react"
import { toast } from "sonner"
import { Button } from "../ui/button"
import { ChatSettingsForm } from "../ui/chat-settings-form"
import ImagePicker from "../ui/image-picker"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { LimitDisplay } from "../ui/limit-display"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "../ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { WithTooltip } from "../ui/with-tooltip"
import { DeleteWorkspace } from "./delete-workspace"

interface WorkspaceSettingsProps {}

export const WorkspaceSettings: FC<WorkspaceSettingsProps> = () => {
  const {
    profile,
    selectedWorkspace,
    setSelectedWorkspace,
    setWorkspaces,
    setChatSettings,
    workspaceImages,
    setWorkspaceImages
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const [name, setName] = useState(selectedWorkspace?.name || "")
  const [imageLink, setImageLink] = useState("")
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [description, setDescription] = useState(
    selectedWorkspace?.description || ""
  )
  const [instructions, setInstructions] = useState(
    selectedWorkspace?.instructions || ""
  )

  const [defaultChatSettings, setDefaultChatSettings] = useState({
    model: selectedWorkspace?.default_model || "deepseek-chat",
    prompt: UNIFIED_SYSTEM_PROMPT,
    temperature:
      selectedWorkspace?.default_temperature ?? DEFAULT_CHAT_TEMPERATURE,
    contextLength:
      selectedWorkspace?.default_context_length ?? DEFAULT_CHAT_CONTEXT_LENGTH,
    includeProfileContext: selectedWorkspace?.include_profile_context ?? true,
    includeWorkspaceInstructions:
      selectedWorkspace?.include_workspace_instructions ?? true,
    embeddingsProvider:
      (selectedWorkspace?.embeddings_provider as "openai" | "local") || "openai"
  })

  useEffect(() => {
    if (!selectedWorkspace) return

    setName(selectedWorkspace.name)
    setDescription(selectedWorkspace.description || "")
    setInstructions(selectedWorkspace.instructions || "")
    setSelectedImage(null)
    setDefaultChatSettings({
      model: selectedWorkspace.default_model || "deepseek-chat",
      prompt: UNIFIED_SYSTEM_PROMPT,
      temperature:
        selectedWorkspace.default_temperature ?? DEFAULT_CHAT_TEMPERATURE,
      contextLength:
        selectedWorkspace.default_context_length ?? DEFAULT_CHAT_CONTEXT_LENGTH,
      includeProfileContext: selectedWorkspace.include_profile_context ?? true,
      includeWorkspaceInstructions:
        selectedWorkspace.include_workspace_instructions ?? true,
      embeddingsProvider:
        (selectedWorkspace.embeddings_provider as "openai" | "local") ||
        "openai"
    })
  }, [selectedWorkspace])

  useEffect(() => {
    if (!selectedWorkspace) return

    const workspaceImage =
      workspaceImages.find(image => image.path === selectedWorkspace.image_path)
        ?.base64 || ""

    setImageLink(workspaceImage)
  }, [workspaceImages, selectedWorkspace])

  const handleSave = async () => {
    if (!selectedWorkspace) return

    let imagePath = selectedWorkspace.image_path || ""

    if (selectedImage) {
      imagePath = await uploadWorkspaceImage(selectedWorkspace, selectedImage)

      const url = (await getWorkspaceImageFromStorage(imagePath)) || ""
      if (url) {
        const response = await fetch(url)
        const blob = await response.blob()
        const base64 = await convertBlobToBase64(blob)

        setWorkspaceImages(prev => [
          ...prev,
          {
            workspaceId: selectedWorkspace.id,
            path: imagePath,
            base64,
            url
          }
        ])
      }
    }

    const shouldIncludeProjectPrompt =
      instructions.trim().length > 0
        ? true
        : defaultChatSettings.includeWorkspaceInstructions

    const updatedWorkspace = await updateWorkspace(selectedWorkspace.id, {
      ...selectedWorkspace,
      name,
      description,
      image_path: imagePath,
      instructions,
      default_model: defaultChatSettings.model,
      default_prompt: UNIFIED_SYSTEM_PROMPT,
      default_temperature: defaultChatSettings.temperature,
      default_context_length: defaultChatSettings.contextLength,
      embeddings_provider: defaultChatSettings.embeddingsProvider,
      include_profile_context: defaultChatSettings.includeProfileContext,
      include_workspace_instructions: shouldIncludeProjectPrompt
    })

    if (
      defaultChatSettings.model &&
      defaultChatSettings.prompt !== undefined &&
      typeof defaultChatSettings.temperature === "number" &&
      typeof defaultChatSettings.contextLength === "number" &&
      defaultChatSettings.embeddingsProvider
    ) {
      setChatSettings({
        model: defaultChatSettings.model as LLMID,
        prompt: UNIFIED_SYSTEM_PROMPT,
        temperature: defaultChatSettings.temperature,
        contextLength: defaultChatSettings.contextLength,
        includeProfileContext: defaultChatSettings.includeProfileContext,
        includeWorkspaceInstructions: shouldIncludeProjectPrompt,
        embeddingsProvider: defaultChatSettings.embeddingsProvider as
          | "openai"
          | "local"
      })
    }

    setIsOpen(false)
    setSelectedWorkspace(updatedWorkspace)
    setWorkspaces(workspaces =>
      workspaces.map(workspace =>
        workspace.id === selectedWorkspace.id ? updatedWorkspace : workspace
      )
    )

    toast.success("项目设置已保存")
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      buttonRef.current?.click()
    }
  }

  if (!selectedWorkspace || !profile) return null

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <WithTooltip
          display={<div>项目设置</div>}
          trigger={
            <IconSettings
              className="ml-3 cursor-pointer pr-[5px] hover:opacity-50"
              size={32}
              onClick={() => setIsOpen(true)}
            />
          }
        />
      </SheetTrigger>

      <SheetContent
        className="flex flex-col justify-between"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              项目设置
              {selectedWorkspace.is_home && <IconHome />}
            </SheetTitle>

            {selectedWorkspace.is_home && (
              <div className="text-sm font-light">
                这是默认项目（本地单用户模式）。
              </div>
            )}
          </SheetHeader>

          <Tabs defaultValue="main">
            <TabsList className="mt-4 grid w-full grid-cols-2">
              <TabsTrigger value="main">基础信息</TabsTrigger>
              <TabsTrigger value="defaults">默认对话参数</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-4" value="main">
              <div className="space-y-1">
                <Label>项目名称</Label>
                <Input
                  placeholder="请输入项目名称"
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>项目说明（可选）</Label>
                <Input
                  placeholder="例如：个人知识库与任务规划"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>项目封面</Label>
                <ImagePicker
                  src={imageLink}
                  image={selectedImage}
                  onSrcChange={setImageLink}
                  onImageChange={setSelectedImage}
                  width={50}
                  height={50}
                />
              </div>

              <div className="space-y-1">
                <Label>项目统一提示词（Project Prompt）</Label>

                <div className="text-muted-foreground text-xs">
                  该提示词会作为项目级系统指令，作用于本项目的新对话。
                </div>

                <TextareaAutosize
                  placeholder="例如：始终用中文回答，先给结论，再给步骤。"
                  value={instructions}
                  onValueChange={setInstructions}
                  minRows={6}
                  maxRows={12}
                  maxLength={WORKSPACE_INSTRUCTIONS_MAX}
                />

                <LimitDisplay
                  used={instructions.length}
                  limit={WORKSPACE_INSTRUCTIONS_MAX}
                />
              </div>
            </TabsContent>

            <TabsContent className="mt-5" value="defaults">
              <div className="mb-4 text-sm">
                下面是进入该项目时使用的默认对话参数。
              </div>

              <ChatSettingsForm
                chatSettings={defaultChatSettings as any}
                onChangeChatSettings={setDefaultChatSettings as any}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-6 flex justify-between">
          <div>
            {!selectedWorkspace.is_home && (
              <DeleteWorkspace
                workspace={selectedWorkspace}
                onDelete={() => setIsOpen(false)}
              />
            )}
          </div>

          <div className="space-x-2">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              取消
            </Button>

            <Button ref={buttonRef} onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
