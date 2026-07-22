import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"
import { redirect } from "next/navigation"

interface HomePageProps {
  params: { locale: string }
}

export default function HomePage({ params: { locale } }: HomePageProps) {
  redirect(`/${locale}/${LOCAL_WORKSPACE_ID}/chat`)
}
