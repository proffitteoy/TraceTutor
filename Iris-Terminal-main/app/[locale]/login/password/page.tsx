import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"
import { redirect } from "next/navigation"

interface PasswordResetPageProps {
  params: { locale: string }
}

export default function PasswordResetPage({
  params: { locale }
}: PasswordResetPageProps) {
  redirect(`/${locale}/${LOCAL_WORKSPACE_ID}/chat`)
}
