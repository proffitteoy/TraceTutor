import type { Metadata } from "next"
import type { ReactNode } from "react"
import "@xyflow/react/dist/style.css"
import "../../../Iris-Terminal-main/node_modules/katex/dist/katex.min.css"
import "./globals.css"

export const metadata: Metadata = {
  title: "TraceTutor · 数学做题工作台",
  description: "从已批准题库选题、作答并获得 Iris 判题反馈"
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
