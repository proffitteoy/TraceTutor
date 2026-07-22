import { SidebarTab } from "@/types"
import { FC } from "react"
import { TabsTrigger } from "../ui/tabs"
import { WithTooltip } from "../ui/with-tooltip"

interface SidebarSwitchItemProps {
  contentType: SidebarTab
  icon: React.ReactNode
  onContentTypeChange: (contentType: SidebarTab) => void
}

export const SidebarSwitchItem: FC<SidebarSwitchItemProps> = ({
  contentType,
  icon,
  onContentTypeChange
}) => {
  const contentTypeLabelMap: Record<SidebarTab, string> = {
    chats: "对话",
    projects: "项目",
    summaries: "总结"
  }

  return (
    <WithTooltip
      display={<div>{contentTypeLabelMap[contentType]}</div>}
      trigger={
        <TabsTrigger
          className="hover:opacity-50"
          value={contentType}
          onClick={() => onContentTypeChange(contentType)}
        >
          {icon}
        </TabsTrigger>
      }
    />
  )
}
