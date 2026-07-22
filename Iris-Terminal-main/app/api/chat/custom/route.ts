import { ServerRuntime } from "next"

export const runtime: ServerRuntime = "edge"

export async function POST() {
  return new Response(
    JSON.stringify({
      message: "Custom models are disabled in local mode."
    }),
    { status: 501 }
  )
}
