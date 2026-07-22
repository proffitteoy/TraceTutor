import { PROJECT_NAME } from "@/lib/project-config"
import { FC } from "react"

interface FinishStepProps {
  displayName: string
}

export const FinishStep: FC<FinishStepProps> = ({ displayName }) => {
  return (
    <div className="space-y-4">
      <div>
        欢迎使用 {PROJECT_NAME}
        {displayName.length > 0 ? `，${displayName.split(" ")[0]}` : null}！
      </div>

      <div>点击“下一步”开始对话。</div>
    </div>
  )
}
