import { type NextRequest, NextResponse } from "next/server"

const API_TARGET = process.env.TRACE_TUTOR_API_BASE || "http://127.0.0.1:4100"

async function handler(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const targetPath = path.join("/")
  const targetUrl = `${API_TARGET}/${targetPath}${request.nextUrl.search}`

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    if (!key.toLowerCase().startsWith("host") && !key.toLowerCase().startsWith("content-length")) {
      headers[key] = value
    }
  })

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text()
    }

    const response = await fetch(targetUrl, init)

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      if (!key.toLowerCase().startsWith("transfer-encoding") && key.toLowerCase() !== "content-length") {
        responseHeaders[key] = value
      }
    })

    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(`[API Proxy] Error proxying ${request.method} /api/${targetPath}:`, error)
    return NextResponse.json(
      { error: { code: "proxy_error", message: `Failed to proxy to backend: ${error instanceof Error ? error.message : String(error)}` } },
      { status: 502 }
    )
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
