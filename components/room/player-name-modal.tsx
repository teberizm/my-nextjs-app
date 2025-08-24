"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface PlayerNameModalProps {
  roomId: string
  adminPassword?: string
  onSubmit: (name: string, isAdmin: boolean) => void
}

export function PlayerNameModal({ roomId, adminPassword, onSubmit }: PlayerNameModalProps) {
  const [name, setName] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [password, setPassword] = useState("")

  const canSave = name.trim().length > 0 && (!isAdmin || password === adminPassword)

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm bg-card border-border" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Oda {roomId}</DialogTitle>
          <DialogDescription>Lütfen isminizi girin</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="player-name">İsim</Label>
            <Input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adınız"
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
        </div>
        <Button className="w-full" disabled={!canSave} onClick={() => onSubmit(name.trim(), isAdmin)}>
          Kaydet
        </Button>
      </DialogContent>
    </Dialog>
  )
}

