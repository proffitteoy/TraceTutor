import path from "path"
import { writeVaultNote } from "./note-writer"
import { toObsidianUri } from "./obsidian-uri"

interface WriteDraftInput {
  vaultRoot: string
  vaultName: string
  title: string
  markdown: string
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")

export const writeDraftToObsidian = async ({
  vaultRoot,
  vaultName,
  title,
  markdown
}: WriteDraftInput) => {
  const datePrefix = new Date().toISOString().slice(0, 10)
  const fileName = `${datePrefix}-${slugify(title || "ai-draft")}.md`
  const relativePath = path
    .join("90_AI_Drafts", fileName)
    .replace(/\\/g, "/")

  const absolutePath = await writeVaultNote({
    vaultRoot,
    relativePath,
    content: markdown
  })

  return {
    relativePath,
    absolutePath,
    uri: toObsidianUri(vaultName, relativePath)
  }
}
