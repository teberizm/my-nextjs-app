"use client"

import { useState, useEffect } from "react"
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
  const [room, setRoom] = useState<string | null>(null)

  // URL’den oda kodunu al, localStorage’a yaz, ekranda göster
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const r = (params.get("room") || localStorage.getItem("tebova_room") || "").trim()
    if (r) {
      localStorage.setItem("tebova_room", r)
      setRoom(r)
    }
  }, [])

  const handleSubmit = () => {
    const ok = onJoin(name.trim(), isAdmin, password)
    if (!ok) setError("Şifre yanlış")
  }

  const canSubmit = name.trim() !== "" && (!isAdmin || password.trim() !== "")

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>İsmini Gir</DialogTitle>
          <DialogDescription>
            Oyuna katılmak için adını yaz.
            {room && (
              <>
                <br />
                <span className="inline-block mt-2 rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                  Oda: {room}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="player-name">İsim</Label>
            <Input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör: Mehmet"
            />
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
                placeholder="Yönetici şifresi"
              />
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button disabled={!canSubmit} onClick={handleSubmit} className="w-full">
            Kaydet
          </Button>

          {/* Oda bilgisi yoksa minik bir uyarı (akışı bozmaz) */}
          {!room && (
            <p className="text-xs text-muted-foreground">
              Not: Oda kodu bulunamadı. Yine de devam edebilirsin, ancak farklı oyuncularla aynı odada olmayabilirsin.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
