export const storagePathToUrl = (bucket: string, relativePath: string) => {
  return `/api/storage/${bucket}/${relativePath}`
}
