import { ModelIcon } from "@/components/models/model-icon"
import { ChatSettingsForm } from "@/components/ui/chat-settings-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChatbotUIContext } from "@/context/context"
import { PRESET_NAME_MAX } from "@/db/limits"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { Tables } from "@/types/database"
import { FC, useContext, useState } from "react"
import { SidebarItem } from "../all/sidebar-display-item"

interface PresetItemProps {
  preset: Tables<"presets">
}

export const PresetItem: FC<PresetItemProps> = ({ preset }) => {
  const { availableHostedModels } = useContext(ChatbotUIContext)
  const [name, setName] = useState(preset.name)
  const [isTyping, setIsTyping] = useState(false)
  const [description, setDescription] = useState(preset.description)
  const [presetChatSettings, setPresetChatSettings] = useState({
    model: preset.model,
    prompt: preset.prompt,
    temperature: preset.temperature,
    contextLength: preset.context_length,
    includeProfileContext: preset.include_profile_context,
    includeWorkspaceInstructions: preset.include_workspace_instructions
  })

  const modelDetails = [...LLM_LIST, ...availableHostedModels].find(
    model => model.modelId === preset.model
  )

  return (
    <SidebarItem
      item={preset}
      isTyping={isTyping}
      contentType="presets"
      icon={
        <ModelIcon
          provider={modelDetails?.provider || "custom"}
          modelId={modelDetails?.modelId || preset.model}
          modelName={modelDetails?.modelName || preset.model}
          height={30}
          width={30}
        />
      }
      updateState={{
        name,
        description,
        include_profile_context: presetChatSettings.includeProfileContext,
        include_workspace_instructions:
          presetChatSettings.includeWorkspaceInstructions,
        context_length: presetChatSettings.contextLength,
        model: presetChatSettings.model,
        prompt: presetChatSettings.prompt,
        temperature: presetChatSettings.temperature
      }}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>名称</Label>

            <Input
              placeholder="预设名称..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={PRESET_NAME_MAX}
            />
          </div>

          <ChatSettingsForm
            chatSettings={presetChatSettings as any}
            onChangeChatSettings={setPresetChatSettings}
            useAdvancedDropdown={true}
          />
        </>
      )}
    />
  )
}
