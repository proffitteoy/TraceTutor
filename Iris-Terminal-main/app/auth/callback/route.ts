import { NextResponse } from "next/server"
import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(
    `${requestUrl.origin}/${LOCAL_WORKSPACE_ID}/chat`
  )
}
