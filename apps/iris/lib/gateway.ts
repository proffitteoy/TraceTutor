import type { IrisGateway } from "@/lib/contracts"
import { HttpGateway } from "@/lib/gateways/http-gateway"

export function createGateway(): IrisGateway | null {
  const baseUrl = process.env.NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL?.replace(
    /\/$/,
    ""
  )

  return baseUrl ? new HttpGateway(baseUrl) : null
}
