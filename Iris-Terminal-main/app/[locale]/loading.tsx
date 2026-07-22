"use client"

import { IconLoader2 } from "@tabler/icons-react"
import { useEffect } from "react"

export default function Loading() {
  useEffect(() => {
    document.body.classList.add("app-loading-background")

    return () => {
      document.body.classList.remove("app-loading-background")
    }
  }, [])

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="bg-background/55 border-border/60 flex min-w-[220px] flex-col items-center rounded-xl border px-6 py-5 backdrop-blur-sm">
        <IconLoader2 className="size-10 animate-spin" />
        <div className="mt-3 text-sm">正在加载页面...</div>
      </div>
    </div>
  )
}
