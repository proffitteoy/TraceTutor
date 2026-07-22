import { ChatbotUIContext } from "@/context/context"
import { ContentType, SidebarTab } from "@/types"
import { Tables } from "@/types/database"
import { FC, useContext } from "react"
import { WorkspaceSwitcher } from "../utility/workspace-switcher"
import { SIDEBAR_WIDTH } from "../ui/dashboard"
import { TabsContent } from "../ui/tabs"
import { WorkspaceSettings } from "../workspace/workspace-settings"
import { SidebarContent } from "./sidebar-content"
import { SidebarProjects } from "./sidebar-projects"
import { SidebarSummaries } from "./sidebar-summaries"

interface SidebarProps {
  contentType: SidebarTab
  showSidebar: boolean
}

export const Sidebar: FC<SidebarProps> = ({ contentType, showSidebar }) => {
  const { folders, chats } = useContext(ChatbotUIContext)

  const chatFolders = folders.filter(folder => folder.type === "chats")

  const renderSidebarContent = (
    dataType: ContentType,
    data: any[],
    dataFolders: Tables<"folders">[]
  ) => {
    return (
      <SidebarContent
        contentType={dataType}
        data={data}
        folders={dataFolders}
      />
    )
  }

  return (
    <TabsContent
      className="m-0 w-full space-y-2"
      style={{
        minWidth: showSidebar ? `calc(${SIDEBAR_WIDTH}px - 60px)` : "0px",
        maxWidth: showSidebar ? `calc(${SIDEBAR_WIDTH}px - 60px)` : "0px",
        width: showSidebar ? `calc(${SIDEBAR_WIDTH}px - 60px)` : "0px"
      }}
      value={contentType}
    >
      <div className="flex h-full flex-col p-3">
        <div className="flex items-center border-b-2 pb-2">
          <WorkspaceSwitcher />
          <WorkspaceSettings />
        </div>

        {(() => {
          switch (contentType) {
            case "chats":
              return renderSidebarContent("chats", chats, chatFolders)

            case "projects":
              return <SidebarProjects />

            case "summaries":
              return <SidebarSummaries />

            default:
              return null
          }
        })()}
      </div>
    </TabsContent>
  )
}
