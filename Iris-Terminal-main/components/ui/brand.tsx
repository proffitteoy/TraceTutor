"use client"

import { PROJECT_NAME } from "@/lib/project-config"
import Image from "next/image"
import Link from "next/link"
import { FC } from "react"

interface BrandProps {
  theme?: "dark" | "light"
}

export const Brand: FC<BrandProps> = () => {
  return (
    <Link
      className="flex cursor-pointer flex-col items-center hover:opacity-80"
      href="/"
    >
      <div className="border-border/60 mb-2 overflow-hidden rounded-xl border bg-white/70 p-1 dark:bg-black/40">
        <Image
          src="/branding/logo.jpg"
          alt={PROJECT_NAME}
          width={72}
          height={72}
          className="size-[72px] object-cover"
          priority
        />
      </div>

      <div className="text-center text-2xl font-bold tracking-wide">
        {PROJECT_NAME}
      </div>
    </Link>
  )
}
