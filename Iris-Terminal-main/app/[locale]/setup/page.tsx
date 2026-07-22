import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"
import { redirect } from "next/navigation"

interface SetupPageProps {
  params: { locale: string }
}

export default function SetupPage({ params: { locale } }: SetupPageProps) {
  redirect(`/${locale}/${LOCAL_WORKSPACE_ID}/chat`)
}
