export class UnsupportedLocalFeatureError extends Error {
  constructor(feature: string) {
    super(
      `本地模式暂不支持 ${feature}。请先补齐对应的 Prisma 模型、本地 API 和 db 包装层后再启用该能力。`
    )
    this.name = "UnsupportedLocalFeatureError"
  }
}

export const unsupportedLocalFeature = (feature: string): never => {
  throw new UnsupportedLocalFeatureError(feature)
}
