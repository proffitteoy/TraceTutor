import { ChatbotUIContext } from "@/context/context"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext } from "react"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

export const SidebarProjects: FC = () => {
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  const { workspaces, selectedWorkspace, setSelectedWorkspace } =
    useContext(ChatbotUIContext)

  const handleOpenProject = (workspaceId: string) => {
    const workspace = workspaces.find(item => item.id === workspaceId)
    if (!workspace) return

    setSelectedWorkspace(workspace)
    router.push(`/${locale}/${workspace.id}/chat`)
  }

  return (
    <div className="flex max-h-[calc(100%-50px)] grow flex-col">
      <div className="text-muted-foreground mt-2 text-xs">
        {
          "\u65b0\u5efa\u9879\u76ee\u8bf7\u4f7f\u7528\u9876\u90e8\u9879\u76ee\u5207\u6362\u5668\u4e2d\u7684\u201c\u65b0\u5efa\u9879\u76ee\u201d\u3002"
        }
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-auto pr-1">
        {workspaces.length === 0 && (
          <div className="text-muted-foreground text-sm">
            {"\u6682\u65e0\u9879\u76ee"}
          </div>
        )}

        {workspaces.map(workspace => (
          <div key={workspace.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {workspace.name}
                </div>
                {workspace.description && (
                  <div className="text-muted-foreground mt-1 text-xs">
                    {workspace.description}
                  </div>
                )}
              </div>

              {workspace.is_home && (
                <Badge variant="outline">{"\u9ed8\u8ba4"}</Badge>
              )}
            </div>

            <div className="mt-3">
              <Button
                size="sm"
                variant={
                  selectedWorkspace?.id === workspace.id ? "secondary" : "ghost"
                }
                onClick={() => handleOpenProject(workspace.id)}
              >
                {selectedWorkspace?.id === workspace.id
                  ? "\u5f53\u524d\u9879\u76ee"
                  : "\u8fdb\u5165\u9879\u76ee"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
