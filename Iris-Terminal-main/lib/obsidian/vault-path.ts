import { promises as fs } from "fs"
import path from "path"

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/")

export const resolveVaultPath = async (inputPath: string) => {
  const resolved = path.resolve(inputPath)
  const stats = await fs.stat(resolved)
  if (!stats.isDirectory()) {
    throw new Error("Vault 路径不是目录")
  }
  return normalizeSlashes(resolved)
}

export const resolveNoteAbsolutePath = (vaultRoot: string, relativePath: string) => {
  const normalizedRoot = normalizeSlashes(path.resolve(vaultRoot))
  const resolved = normalizeSlashes(path.resolve(vaultRoot, relativePath))

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error("目标路径越界，已拒绝写入")
  }

  return resolved
}
