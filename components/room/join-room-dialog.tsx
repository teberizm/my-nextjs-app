"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface JoinRoomDialogProps {
  onJoin: (name: string, isAdmin: boolean, password?: string) => boolean
}

export function JoinRoomDialog({ onJoin }: JoinRoomDialogProps) {
  const [name, setName] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    const ok = onJoin(name.trim(), isAdmin, password)
    if (!ok) {
      setError("Şifre yanlış")
    }
  }

  const canSubmit = name.trim() !== "" && (!isAdmin || password.trim() !== "")

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>İsmini Gir</DialogTitle>
          <DialogDescription>Oyuna katılmak için adını yaz.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="player-name">İsim</Label>
            <Input id="player-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="is-admin" checked={isAdmin} onCheckedChange={(v) => setIsAdmin(!!v)} />
            <Label htmlFor="is-admin">Yönetici</Label>
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="admin-password">Şifre</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button disabled={!canSubmit} onClick={handleSubmit} className="w-full">
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
