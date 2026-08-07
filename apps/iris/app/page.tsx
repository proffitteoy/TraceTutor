import { TutorShell } from "@/components/tutor-shell"

const API_BASE = process.env.TRACE_TUTOR_API_BASE || "http://127.0.0.1:4100"

export default async function HomePage() {
  let initialQuestions: Record<string, unknown>[] = []
  let initialServiceStatus: "ready" | "degraded" | "checking" = "checking"
  let initialServiceError: string | null = null

  try {
    const [healthRes, questionsRes] = await Promise.all([
      fetch(`${API_BASE}/health/ready`, { cache: "no-store" }).catch(() => null),
      fetch(`${API_BASE}/questions/practice`, { cache: "no-store" }).catch(() => null),
    ])

    if (healthRes?.ok) {
      const health = await healthRes.json()
      initialServiceStatus = health.status === "ready" ? "ready" : "degraded"
    } else if (healthRes) {
      initialServiceStatus = "degraded"
    } else {
      initialServiceError = "服务不可达"
    }

    if (questionsRes?.ok) {
      const data = await questionsRes.json()
      initialQuestions = data.questions || []
    }
  } catch (err) {
    initialServiceError = err instanceof Error ? err.message : "未知错误"
  }

  return (
    <TutorShell
      initialQuestions={initialQuestions}
      initialServiceStatus={initialServiceStatus}
      initialServiceError={initialServiceError}
    />
  )
}
