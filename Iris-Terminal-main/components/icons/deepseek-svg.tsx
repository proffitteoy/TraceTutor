import { FC } from "react"

interface DeepSeekSVGProps {
  height?: number
  width?: number
  className?: string
}

export const DeepSeekSVG: FC<DeepSeekSVGProps> = ({
  height = 40,
  width = 40,
  className
}) => {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
    >
      <rect x="2.5" y="2.5" width="35" height="35" rx="8" fill="#1F6BFF" />
      <path
        d="M12 10H21.5C25.6421 10 29 13.3579 29 17.5C29 21.6421 25.6421 25 21.5 25H16V30H12V10Z"
        fill="white"
      />
      <path
        d="M16 14V21H21.5C23.433 21 25 19.433 25 17.5C25 15.567 23.433 14 21.5 14H16Z"
        fill="#1F6BFF"
      />
      <path
        d="M16 26H22.5C25.5376 26 28 28.4624 28 31.5V32H24V31.5C24 30.6716 23.3284 30 22.5 30H16V26Z"
        fill="white"
      />
    </svg>
  )
}
