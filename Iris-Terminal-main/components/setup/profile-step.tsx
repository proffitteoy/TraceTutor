import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_USERNAME_MAX,
  PROFILE_USERNAME_MIN
} from "@/db/limits"
import {
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconLoader2
} from "@tabler/icons-react"
import { FC, useRef, useState } from "react"
import { toast } from "sonner"
import { LimitDisplay } from "../ui/limit-display"

interface ProfileStepProps {
  username: string
  usernameAvailable: boolean
  displayName: string
  onUsernameAvailableChange: (isAvailable: boolean) => void
  onUsernameChange: (username: string) => void
  onDisplayNameChange: (name: string) => void
}

export const ProfileStep: FC<ProfileStepProps> = ({
  username,
  usernameAvailable,
  displayName,
  onUsernameAvailableChange,
  onUsernameChange,
  onDisplayNameChange
}) => {
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkUsernameAvailability = (username: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      if (!username) return

      if (username.length < PROFILE_USERNAME_MIN) {
        onUsernameAvailableChange(false)
        return
      }

      if (username.length > PROFILE_USERNAME_MAX) {
        onUsernameAvailableChange(false)
        return
      }

      const usernameRegex = /^[a-zA-Z0-9_]+$/
      if (!usernameRegex.test(username)) {
        onUsernameAvailableChange(false)
        toast.error(
          "用户名只能包含字母、数字或下划线，不能包含空格或其他字符。"
        )
        return
      }

      setLoading(true)

      const response = await fetch(`/api/username/available`, {
        method: "POST",
        body: JSON.stringify({ username })
      })

      const data = await response.json()
      const isAvailable = data.isAvailable

      onUsernameAvailableChange(isAvailable)

      setLoading(false)
    }, 500)
  }

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Label>用户名</Label>

          <div className="text-xs">
            {usernameAvailable ? (
              <div className="text-green-500">可用</div>
            ) : (
              <div className="text-red-500">不可用</div>
            )}
          </div>
        </div>

        <div className="relative">
          <Input
            className="pr-10"
            placeholder="用户名"
            value={username}
            onChange={e => {
              onUsernameChange(e.target.value)
              checkUsernameAvailability(e.target.value)
            }}
            minLength={PROFILE_USERNAME_MIN}
            maxLength={PROFILE_USERNAME_MAX}
          />

          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {loading ? (
              <IconLoader2 className="animate-spin" />
            ) : usernameAvailable ? (
              <IconCircleCheckFilled className="text-green-500" />
            ) : (
              <IconCircleXFilled className="text-red-500" />
            )}
          </div>
        </div>

        <LimitDisplay used={username.length} limit={PROFILE_USERNAME_MAX} />
      </div>

      <div className="space-y-1">
        <Label>对话显示名称</Label>

        <Input
          placeholder="你的名称"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
          maxLength={PROFILE_DISPLAY_NAME_MAX}
        />

        <LimitDisplay
          used={displayName.length}
          limit={PROFILE_DISPLAY_NAME_MAX}
        />
      </div>
    </>
  )
}
