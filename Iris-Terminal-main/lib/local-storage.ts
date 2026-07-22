import { promises as fs } from "fs"
import path from "path"

const STORAGE_ROOT =
  process.env.LOCAL_STORAGE_PATH?.trim() || path.join(process.cwd(), "storage")

export const getStorageRoot = () => STORAGE_ROOT

export const ensureStorageDir = async (relativeDir: string) => {
  const fullPath = path.join(STORAGE_ROOT, relativeDir)
  await fs.mkdir(fullPath, { recursive: true })
  return fullPath
}

export const writeStorageFile = async (relativePath: string, data: Buffer) => {
  const fullPath = path.join(STORAGE_ROOT, relativePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, data)
  return fullPath
}

export const readStorageFile = async (relativePath: string) => {
  const fullPath = path.join(STORAGE_ROOT, relativePath)
  return await fs.readFile(fullPath)
}

export const storagePathToUrl = (bucket: string, relativePath: string) => {
  return `/api/storage/${bucket}/${relativePath}`
}
