import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { NextResponse } from "next/server"

export async function GET() {
  const { profile } = await ensureLocalBootstrap()
  return NextResponse.json(profile)
}

export async function PUT(request: Request) {
  // Local hardcoded mode: profile settings are managed by ensureLocalBootstrap
  // and project config files, not runtime UI writes.
  await request.json().catch(() => ({}))
  const { profile } = await ensureLocalBootstrap()
  return NextResponse.json(profile)
}
