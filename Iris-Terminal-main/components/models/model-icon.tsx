import { cn } from "@/lib/utils"
import mistral from "@/public/providers/mistral.png"
import groq from "@/public/providers/groq.png"
import perplexity from "@/public/providers/perplexity.png"
import { ModelProvider } from "@/types"
import { IconSparkles } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import Image from "next/image"
import { FC, HTMLAttributes } from "react"
import { AnthropicSVG } from "../icons/anthropic-svg"
import { DeepSeekSVG } from "../icons/deepseek-svg"
import { GoogleSVG } from "../icons/google-svg"
import { GrokSVG } from "../icons/grok-svg"
import { OpenAISVG } from "../icons/openai-svg"

interface ModelIconProps extends HTMLAttributes<HTMLDivElement> {
  provider: ModelProvider
  modelId?: string
  modelName?: string
  height: number
  width: number
}

export const ModelIcon: FC<ModelIconProps> = ({
  provider,
  modelId = "",
  modelName = "",
  height,
  width,
  ...props
}) => {
  const { theme } = useTheme()

  const normalizedModel = `${modelId} ${modelName}`.toLowerCase()
  const normalizedModelId = normalizedModel
    .replace("gptsapi::", "")
    .replace(/\s+/g, " ")
    .trim()

  const modelFamily = (() => {
    if (normalizedModelId.includes("deepseek")) return "deepseek"
    if (normalizedModelId.includes("grok")) return "grok"
    if (normalizedModelId.includes("gemini")) return "gemini"
    if (normalizedModelId.includes("claude")) return "claude"
    if (normalizedModelId.includes("gpt") || normalizedModelId.includes("o1")) {
      return "gpt"
    }
    return "unknown"
  })()

  const resolvedProvider: ModelProvider =
    modelFamily === "deepseek"
      ? "deepseek"
      : modelFamily === "grok"
        ? "groq"
        : modelFamily === "gemini"
          ? "google"
          : modelFamily === "claude"
            ? "anthropic"
            : modelFamily === "gpt"
              ? "openai"
              : provider

  switch (resolvedProvider as ModelProvider) {
    case "openai":
      return (
        <OpenAISVG
          className={cn(
            "rounded-sm bg-white p-1 text-black",
            props.className,
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          width={width}
          height={height}
        />
      )
    case "mistral":
      return (
        <Image
          className={cn(
            "rounded-sm p-1",
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          src={mistral.src}
          alt="Mistral"
          width={width}
          height={height}
        />
      )
    case "gptsapi":
      if (modelFamily === "grok") {
        return (
          <GrokSVG
            className={cn(
              "rounded-sm",
              theme === "dark" ? "bg-black" : "border-DEFAULT border-black"
            )}
            width={width}
            height={height}
          />
        )
      }
      return <IconSparkles size={width} />
    case "groq":
      if (modelFamily === "grok") {
        return (
          <GrokSVG
            className={cn(
              "rounded-sm",
              theme === "dark" ? "bg-black" : "border-DEFAULT border-black"
            )}
            width={width}
            height={height}
          />
        )
      }
      return (
        <Image
          className={cn(
            "rounded-sm p-0",
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          src={groq.src}
          alt="Groq"
          width={width}
          height={height}
        />
      )
    case "deepseek":
      return (
        <DeepSeekSVG
          className={cn(
            "rounded-sm p-0",
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          width={width}
          height={height}
        />
      )
    case "anthropic":
      return (
        <AnthropicSVG
          className={cn(
            "rounded-sm bg-white p-1 text-black",
            props.className,
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          width={width}
          height={height}
        />
      )
    case "google":
      return (
        <GoogleSVG
          className={cn(
            "rounded-sm bg-white p-1 text-black",
            props.className,
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          width={width}
          height={height}
        />
      )
    case "perplexity":
      return (
        <Image
          className={cn(
            "rounded-sm p-1",
            theme === "dark" ? "bg-white" : "border-DEFAULT border-black"
          )}
          src={perplexity.src}
          alt="Mistral"
          width={width}
          height={height}
        />
      )
    default:
      return <IconSparkles size={width} />
  }
}
