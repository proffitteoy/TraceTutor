"use client"

import { LOCAL_WORKSPACE_ID } from "@/lib/local-config"
import { useRouter } from "next/navigation"
import { FC } from "react"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog"

interface ChangePasswordProps {}

export const ChangePassword: FC<ChangePasswordProps> = () => {
  const router = useRouter()

  const handleReturn = () => {
    router.push(`/${LOCAL_WORKSPACE_ID}`)
  }

  return (
    <Dialog open={true}>
      <DialogContent className="h-[200px] w-[420px] p-4">
        <DialogHeader>
          <DialogTitle>更改密码</DialogTitle>
        </DialogHeader>

        <div className="text-muted-foreground text-sm">
          本地模式未启用账号系统，无法修改密码。
        </div>

        <DialogFooter>
          <Button onClick={handleReturn}>返回</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
