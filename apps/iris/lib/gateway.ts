import type { IrisGateway } from "@/lib/contracts"
import { DemoGateway } from "@/lib/gateways/demo-gateway"
import { HttpGateway } from "@/lib/gateways/http-gateway"

export function createGateway(): IrisGateway {
  const baseUrl = process.env.NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL?.replace(
    /\/$/,
    ""
  )

  return baseUrl ? new HttpGateway(baseUrl) : new DemoGateway()
}
