import { promises as fs } from "fs"
import path from "path"

export interface VaultMarkdownFile {
  absolutePath: string
  relativePath: string
  mtime: Date
  content: string
}

const SKIP_DIRECTORIES = new Set([".git", ".obsidian", "node_modules"])

const walkDirectory = async (
  rootPath: string,
  currentPath: string,
  collector: string[]
) => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const resolved = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      await walkDirectory(rootPath, resolved, collector)
      continue
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue
    }

    collector.push(resolved)
  }
}

export const scanVaultMarkdownFiles = async (
  rootPath: string
): Promise<VaultMarkdownFile[]> => {
  const filePaths: string[] = []
  await walkDirectory(rootPath, rootPath, filePaths)

  const files: VaultMarkdownFile[] = []
  for (const filePath of filePaths.sort()) {
    const [stats, content] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, "utf8")
    ])
    files.push({
      absolutePath: filePath,
      relativePath: path.relative(rootPath, filePath).replace(/\\/g, "/"),
      mtime: stats.mtime,
      content
    })
  }

  return files
}
