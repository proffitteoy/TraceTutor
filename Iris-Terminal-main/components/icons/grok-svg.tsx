import { cn } from "@/lib/utils"
import { FC } from "react"

interface GrokSVGProps {
  width?: number
  height?: number
  className?: string
}

export const GrokSVG: FC<GrokSVGProps> = ({
  width = 24,
  height = 24,
  className
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-label="Grok"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#111111" />
      <path
        d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
