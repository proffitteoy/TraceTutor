"use client"

import { ChatbotUIContext } from "@/context/context"
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits"
import { DEFAULT_CHAT_CONTEXT_LENGTH } from "@/lib/default-chat-settings"
import { ChatSettings } from "@/types"
import { IconInfoCircle } from "@tabler/icons-react"
import { FC, useContext } from "react"
import { ModelSelect } from "../models/model-select"
import { AdvancedSettings } from "./advanced-settings"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./select"
import { Slider } from "./slider"
import { TextareaAutosize } from "./textarea-autosize"
import { WithTooltip } from "./with-tooltip"

interface ChatSettingsFormProps {
  chatSettings: ChatSettings
  onChangeChatSettings: (value: ChatSettings) => void
  useAdvancedDropdown?: boolean
  showTooltip?: boolean
}

export const ChatSettingsForm: FC<ChatSettingsFormProps> = ({
  chatSettings,
  onChangeChatSettings,
  useAdvancedDropdown = true,
  showTooltip = true
}) => {
  const { profile } = useContext(ChatbotUIContext)

  if (!profile) return null

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>模型</Label>

        <ModelSelect
          selectedModelId={chatSettings.model}
          onSelectModel={model => {
            onChangeChatSettings({ ...chatSettings, model })
          }}
        />
      </div>

      <div className="space-y-1">
        <Label>统一系统提示词</Label>

        <TextareaAutosize
          className="bg-background border-input border-2"
          placeholder="统一系统提示词已固定；项目追加提示词请在项目设置中维护。"
          disabled
          value={chatSettings.prompt}
          onValueChange={() => {}}
          minRows={3}
          maxRows={6}
        />
      </div>

      {useAdvancedDropdown ? (
        <AdvancedSettings>
          <AdvancedContent
            chatSettings={chatSettings}
            onChangeChatSettings={onChangeChatSettings}
            showTooltip={showTooltip}
          />
        </AdvancedSettings>
      ) : (
        <div>
          <AdvancedContent
            chatSettings={chatSettings}
            onChangeChatSettings={onChangeChatSettings}
            showTooltip={showTooltip}
          />
        </div>
      )}
    </div>
  )
}

interface AdvancedContentProps {
  chatSettings: ChatSettings
  onChangeChatSettings: (value: ChatSettings) => void
  showTooltip: boolean
}

const AdvancedContent: FC<AdvancedContentProps> = ({
  chatSettings,
  onChangeChatSettings,
  showTooltip
}) => {
  const { profile, selectedWorkspace, availableOpenRouterModels, models } =
    useContext(ChatbotUIContext)

  const isCustomModel = models.some(
    model => model.model_id === chatSettings.model
  )

  const findOpenRouterModel = (modelId: string) => {
    return availableOpenRouterModels.find(model => model.modelId === modelId)
  }

  const modelLimits = CHAT_SETTING_LIMITS[chatSettings.model] || {
    MIN_TEMPERATURE: 0,
    MAX_TEMPERATURE: 1,
    MAX_CONTEXT_LENGTH:
      findOpenRouterModel(chatSettings.model)?.maxContext ||
      DEFAULT_CHAT_CONTEXT_LENGTH
  }

  return (
    <div className="mt-5">
      <div className="space-y-3">
        <Label className="flex items-center space-x-1">
          <div>温度:</div>

          <div>{chatSettings.temperature}</div>
        </Label>

        <Slider
          value={[chatSettings.temperature]}
          onValueChange={temperature => {
            onChangeChatSettings({
              ...chatSettings,
              temperature: temperature[0]
            })
          }}
          min={modelLimits.MIN_TEMPERATURE}
          max={modelLimits.MAX_TEMPERATURE}
          step={0.01}
        />
      </div>

      <div className="mt-6 space-y-3">
        <Label className="flex items-center space-x-1">
          <div>上下文长度:</div>

          <div>{chatSettings.contextLength}</div>
        </Label>

        <Slider
          value={[chatSettings.contextLength]}
          onValueChange={contextLength => {
            onChangeChatSettings({
              ...chatSettings,
              contextLength: contextLength[0]
            })
          }}
          min={0}
          max={
            isCustomModel
              ? models.find(model => model.model_id === chatSettings.model)
                  ?.context_length
              : modelLimits.MAX_CONTEXT_LENGTH
          }
          step={1}
        />
      </div>

      <div className="mt-7 flex items-center space-x-2">
        <Checkbox
          checked={chatSettings.includeProfileContext}
          onCheckedChange={(value: boolean) =>
            onChangeChatSettings({
              ...chatSettings,
              includeProfileContext: value
            })
          }
        />

        <Label>包含个人资料上下文</Label>

        {showTooltip && (
          <WithTooltip
            delayDuration={0}
            display={
              <div className="w-[400px] p-3">
                {profile?.profile_context || "暂无个人资料上下文。"}
              </div>
            }
            trigger={
              <IconInfoCircle
                className="cursor-pointer hover:opacity-60"
                size={16}
              />
            }
          />
        )}
      </div>

      <div className="mt-4 flex items-center space-x-2">
        <Checkbox
          checked={chatSettings.includeWorkspaceInstructions}
          onCheckedChange={(value: boolean) =>
            onChangeChatSettings({
              ...chatSettings,
              includeWorkspaceInstructions: value
            })
          }
        />

        <Label>包含项目追加提示词</Label>

        {showTooltip && (
          <WithTooltip
            delayDuration={0}
            display={
              <div className="w-[400px] p-3">
                {selectedWorkspace?.instructions ||
                  "当前项目未设置追加提示词。"}
              </div>
            }
            trigger={
              <IconInfoCircle
                className="cursor-pointer hover:opacity-60"
                size={16}
              />
            }
          />
        )}
      </div>

      <div className="mt-5">
        <Label>向量提供方</Label>

        <Select
          value={chatSettings.embeddingsProvider}
          onValueChange={(embeddingsProvider: "openai" | "local") => {
            onChangeChatSettings({
              ...chatSettings,
              embeddingsProvider
            })
          }}
        >
          <SelectTrigger>
            <SelectValue defaultValue="openai" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="openai">
              {profile?.use_azure_openai ? "Azure OpenAI" : "OpenAI"}
            </SelectItem>

            {window.location.hostname === "localhost" && (
              <SelectItem value="local">本地</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
