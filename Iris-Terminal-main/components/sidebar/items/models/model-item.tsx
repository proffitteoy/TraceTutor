import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MODEL_NAME_MAX } from "@/db/limits"
import { Tables, TablesUpdate } from "@/types/database"
import { IconSparkles } from "@tabler/icons-react"
import { FC, useState } from "react"
import { SidebarItem } from "../all/sidebar-display-item"

interface ModelItemProps {
  model: Tables<"models">
}

export const ModelItem: FC<ModelItemProps> = ({ model }) => {
  const [isTyping, setIsTyping] = useState(false)

  const [apiKey, setApiKey] = useState(model.api_key)
  const [baseUrl, setBaseUrl] = useState(model.base_url)
  const [description, setDescription] = useState(model.description)
  const [modelId, setModelId] = useState(model.model_id)
  const [name, setName] = useState(model.name)
  const [contextLength, setContextLength] = useState(model.context_length)

  return (
    <SidebarItem
      item={model}
      isTyping={isTyping}
      contentType="models"
      icon={<IconSparkles height={30} width={30} />}
      updateState={
        {
          api_key: apiKey,
          base_url: baseUrl,
          description,
          context_length: contextLength,
          model_id: modelId,
          name
        } as TablesUpdate<"models">
      }
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>名称</Label>

            <Input
              placeholder="模型名称..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={MODEL_NAME_MAX}
            />
          </div>

          <div className="space-y-1">
            <Label>模型 ID</Label>

            <Input
              placeholder="模型 ID..."
              value={modelId}
              onChange={e => setModelId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>基础地址（Base URL）</Label>

            <Input
              placeholder="基础地址..."
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />

            <div className="pt-1 text-xs italic">
              你的 API 必须兼容 OpenAI SDK。
            </div>
          </div>

          <div className="space-y-1">
            <Label>API 密钥</Label>

            <Input
              type="password"
              placeholder="API 密钥..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>最大上下文长度</Label>

            <Input
              type="number"
              placeholder="4096"
              min={0}
              value={contextLength}
              onChange={e => setContextLength(parseInt(e.target.value))}
            />
          </div>
        </>
      )}
    />
  )
}
