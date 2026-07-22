import { EnvKey } from "@/types/key-type"

const ENV_KEY_ALIASES: Partial<Record<EnvKey, string[]>> = {}

export function getEnvironmentKey(type: EnvKey) {
  const candidates = [type, ...(ENV_KEY_ALIASES[type] || [])]

  for (const key of candidates) {
    const value = process.env[key]
    if (value) return value
  }

  return ""
}

// returns true if the key is found in the environment variables
export function isUsingEnvironmentKey(type: EnvKey) {
  return Boolean(getEnvironmentKey(type))
}
