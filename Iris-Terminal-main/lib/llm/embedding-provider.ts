import { generateLocalEmbedding } from "@/lib/generate-local-embedding"

export type EmbeddingProviderType = "local"

export const generateEmbedding = async (
  provider: EmbeddingProviderType,
  input: string
) => {
  if (provider === "local") {
    return generateLocalEmbedding(input)
  }
  throw new Error(`Unsupported embedding provider: ${provider}`)
}
