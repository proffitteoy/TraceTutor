export const toObsidianUri = (vaultName: string, notePath: string) => {
  const normalized = notePath.replace(/\\/g, "/").replace(/\.md$/i, "")
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(
    normalized
  )}`
}
