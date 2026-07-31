import { getEnvironmentKeyMap } from "@/lib/server/env-key-map"
import { createResponse } from "@/lib/server/server-utils"

export async function GET() {
  return createResponse({ isUsingEnvKeyMap: getEnvironmentKeyMap() }, 200)
}
