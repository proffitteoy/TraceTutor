import { ensureLocalBootstrap } from "@/lib/local-bootstrap"
import { NextResponse } from "next/server"

export async function GET() {
  const { profile, workspace } = await ensureLocalBootstrap()
  return NextResponse.json({ profile, workspace })
}
