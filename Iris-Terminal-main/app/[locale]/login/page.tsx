import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"
import { redirect } from "next/navigation"

interface LoginPageProps {
  params: { locale: string }
}

export default function Login({ params: { locale } }: LoginPageProps) {
  redirect(`/${locale}/${LOCAL_WORKSPACE_ID}/chat`)
}
