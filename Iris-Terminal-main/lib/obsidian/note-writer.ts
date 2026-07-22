import { promises as fs } from "fs"
import path from "path"
import { resolveNoteAbsolutePath } from "./vault-path"

interface WriteNoteInput {
  vaultRoot: string
  relativePath: string
  content: string
}

export const writeVaultNote = async ({
  vaultRoot,
  relativePath,
  content
}: WriteNoteInput) => {
  const absolutePath = resolveNoteAbsolutePath(vaultRoot, relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, content, "utf8")
  return absolutePath
}
