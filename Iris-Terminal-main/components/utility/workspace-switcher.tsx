"use client"

import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { ChatbotUIContext } from "@/context/context"
import { createWorkspace } from "@/db/workspaces"
import useHotkey from "@/lib/hooks/use-hotkey"
import { UNIFIED_SYSTEM_PROMPT } from "@/lib/unified-system-prompt"
import { IconBuilding, IconHome, IconPlus } from "@tabler/icons-react"
import { ChevronsUpDown } from "lucide-react"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { TextareaAutosize } from "../ui/textarea-autosize"

interface WorkspaceSwitcherProps {}

export const WorkspaceSwitcher: FC<WorkspaceSwitcherProps> = () => {
  useHotkey(";", () => setOpen(prevState => !prevState))

  const {
    workspaces,
    workspaceImages,
    selectedWorkspace,
    setSelectedWorkspace,
    setWorkspaces
  } = useContext(ChatbotUIContext)

  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  const [open, setOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [projectPrompt, setProjectPrompt] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const templateWorkspace = selectedWorkspace || workspaces[0] || null

  const homeWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.is_home) || null,
    [workspaces]
  )

  const projectWorkspaces = useMemo(
    () =>
      workspaces
        .filter(workspace => !workspace.is_home)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  )

  const getWorkspaceImage = (workspaceId: string) => {
    return workspaceImages.find(image => image.workspaceId === workspaceId)
  }

  const handleCreateWorkspace = async () => {
    if (!templateWorkspace) return

    const name = projectName.trim()
    if (!name) {
      toast.error("请输入项目名称")
      return
    }

    setIsCreating(true)

    try {
      const prompt = projectPrompt.trim()
      const createdWorkspace = await createWorkspace({
        user_id: templateWorkspace.user_id,
        default_context_length: templateWorkspace.default_context_length,
        default_model: templateWorkspace.default_model,
        default_prompt: UNIFIED_SYSTEM_PROMPT,
        default_temperature: templateWorkspace.default_temperature,
        description: projectDescription.trim(),
        embeddings_provider: templateWorkspace.embeddings_provider,
        include_profile_context: templateWorkspace.include_profile_context,
        include_workspace_instructions:
          prompt.length > 0
            ? true
            : templateWorkspace.include_workspace_instructions,
        instructions: prompt,
        is_home: false,
        name
      })

      setWorkspaces(prev => [createdWorkspace, ...prev])
      setSelectedWorkspace(createdWorkspace)
      setProjectName("")
      setProjectDescription("")
      setProjectPrompt("")
      setOpen(false)

      toast.success("项目已创建")
      router.push(`/${locale}/${createdWorkspace.id}/chat`)
    } catch (error: any) {
      toast.error(error?.message || "创建项目失败")
    } finally {
      setIsCreating(false)
    }
  }

  const handleSelect = (workspaceId: string) => {
    const workspace = workspaces.find(item => item.id === workspaceId)
    if (!workspace) return

    setSelectedWorkspace(workspace)
    setOpen(false)
    router.push(`/${locale}/${workspace.id}/chat`)
  }

  const selectedWorkspaceImage = selectedWorkspace
    ? getWorkspaceImage(selectedWorkspace.id)
    : null
  const SelectedIconComponent = selectedWorkspace?.is_home
    ? IconHome
    : IconBuilding
  const selectedWorkspaceName = selectedWorkspace?.name || "选择项目..."

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="border-input flex h-[36px]
        w-full cursor-pointer items-center justify-between rounded-md border px-2 py-1 hover:opacity-50"
      >
        <div className="flex items-center truncate">
          {selectedWorkspace && (
            <div className="flex items-center">
              {selectedWorkspaceImage ? (
                <Image
                  style={{ width: "22px", height: "22px" }}
                  className="mr-2 rounded"
                  src={selectedWorkspaceImage.url}
                  width={22}
                  height={22}
                  alt={selectedWorkspace.name}
                />
              ) : (
                <SelectedIconComponent className="mb-0.5 mr-2" size={22} />
              )}
            </div>
          )}

          {selectedWorkspaceName}
        </div>

        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-[360px] p-2">
        <div className="space-y-2">
          <div className="space-y-2 rounded-md border p-2">
            <div className="text-sm font-semibold">新建项目</div>

            <Input
              placeholder="项目名称（必填）"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />

            <Input
              placeholder="项目说明（可选）"
              value={projectDescription}
              onChange={e => setProjectDescription(e.target.value)}
            />

            <TextareaAutosize
              placeholder="项目补充提示词（可选）"
              value={projectPrompt}
              onValueChange={setProjectPrompt}
              minRows={3}
              maxRows={6}
            />

            <Button
              className="flex w-full items-center space-x-2"
              size="sm"
              disabled={isCreating}
              onClick={handleCreateWorkspace}
            >
              <IconPlus size={16} />
              <div className="ml-2">
                {isCreating ? "创建中..." : "创建项目"}
              </div>
            </Button>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-auto">
            {homeWorkspace && (
              <div className="space-y-1">
                <div className="text-muted-foreground px-2 text-xs">
                  默认项目
                </div>

                <Button
                  className={`flex h-auto w-full items-center justify-start py-2 ${selectedWorkspace?.id === homeWorkspace.id ? "bg-accent" : ""}`}
                  variant="ghost"
                  onClick={() => handleSelect(homeWorkspace.id)}
                >
                  {getWorkspaceImage(homeWorkspace.id) ? (
                    <Image
                      style={{ width: "24px", height: "24px" }}
                      className="mr-3 rounded"
                      src={getWorkspaceImage(homeWorkspace.id)?.url || ""}
                      width={24}
                      height={24}
                      alt={homeWorkspace.name}
                    />
                  ) : (
                    <IconHome className="mr-3 shrink-0" size={22} />
                  )}

                  <div className="min-w-0 text-left">
                    <div className="truncate font-semibold">
                      {homeWorkspace.name}
                    </div>
                    {homeWorkspace.description && (
                      <div className="text-muted-foreground truncate text-xs">
                        {homeWorkspace.description}
                      </div>
                    )}
                  </div>
                </Button>
              </div>
            )}

            {projectWorkspaces.length > 0 && (
              <div className="space-y-1">
                <div className="text-muted-foreground px-2 text-xs">项目</div>

                {projectWorkspaces.map(workspace => {
                  const image = getWorkspaceImage(workspace.id)

                  return (
                    <Button
                      key={workspace.id}
                      className={`flex h-auto w-full items-center justify-start py-2 ${selectedWorkspace?.id === workspace.id ? "bg-accent" : ""}`}
                      variant="ghost"
                      onClick={() => handleSelect(workspace.id)}
                    >
                      {image ? (
                        <Image
                          style={{ width: "24px", height: "24px" }}
                          className="mr-3 rounded"
                          src={image.url || ""}
                          width={24}
                          height={24}
                          alt={workspace.name}
                        />
                      ) : (
                        <IconBuilding className="mr-3 shrink-0" size={22} />
                      )}

                      <div className="min-w-0 text-left">
                        <div className="truncate font-semibold">
                          {workspace.name}
                        </div>
                        {workspace.description && (
                          <div className="text-muted-foreground truncate text-xs">
                            {workspace.description}
                          </div>
                        )}
                      </div>
                    </Button>
                  )
                })}
              </div>
            )}

            {!homeWorkspace && projectWorkspaces.length === 0 && (
              <div className="text-muted-foreground px-2 py-3 text-sm">
                暂无项目
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
