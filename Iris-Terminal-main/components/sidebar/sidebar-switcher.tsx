import { SidebarTab } from "@/types"
import { IconHistory, IconMessage, IconFolders } from "@tabler/icons-react"
import { FC } from "react"
import { TabsList } from "../ui/tabs"
import { SidebarSwitchItem } from "./sidebar-switch-item"

export const SIDEBAR_ICON_SIZE = 28

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: SidebarTab) => void
}

export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange
}) => {
  return (
    <div className="flex flex-col border-r-2 pb-5">
      <TabsList className="bg-background grid h-[180px] grid-rows-3">
        <SidebarSwitchItem
          icon={<IconMessage size={SIDEBAR_ICON_SIZE} />}
          contentType="chats"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconFolders size={SIDEBAR_ICON_SIZE} />}
          contentType="projects"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconHistory size={SIDEBAR_ICON_SIZE} />}
          contentType="summaries"
          onContentTypeChange={onContentTypeChange}
        />
      </TabsList>
    </div>
  )
}
