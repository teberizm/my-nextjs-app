"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Settings, Users, Clock, Zap } from "lucide-react"
import type { GameSettings } from "@/lib/types"

interface CreateRoomModalProps {
  onCreateRoom: (settings: GameSettings & { roomName: string; maxPlayers: number }) => void
  children: React.ReactNode
}

export function CreateRoomModal({ onCreateRoom, children }: CreateRoomModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [roomName, setRoomName] = useState("")
  const [maxPlayers, setMaxPlayers] = useState([8])
  const [traitorCount, setTraitorCount] = useState([2])
  const [specialRoleCount, setSpecialRoleCount] = useState([2])
  const [nightDuration, setNightDuration] = useState([60])
  const [dayDuration, setDayDuration] = useState([120])
  const [voteDuration, setVoteDuration] = useState([45])
  const [cardProfile, setCardProfile] = useState<"STANDARD" | "CHAOS" | "QUICK">("STANDARD")

  const handleCreate = () => {
    onCreateRoom({
      roomName,
      maxPlayers: maxPlayers[0],
      traitorCount: traitorCount[0],
      specialRoleCount: specialRoleCount[0],
      nightDuration: nightDuration[0],
      dayDuration: dayDuration[0],
      voteDuration: voteDuration[0],
      cardProfile,
    })
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-work-sans">
            <Settings className="w-5 h-5 text-primary" />
            Oda Oluştur
          </DialogTitle>
          <DialogDescription>Oyun ayarlarını yapılandırın ve odanızı oluşturun</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Room Name */}
          <div className="space-y-2">
            <Label htmlFor="roomName">Oda Adı</Label>
            <Input
              id="roomName"
              placeholder="Oda adını girin..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-input border-border"
            />
          </div>

          {/* Max Players */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4 text-secondary" />
              Maksimum Oyuncu: {maxPlayers[0]}
            </Label>
            <Slider value={maxPlayers} onValueChange={setMaxPlayers} max={12} min={4} step={1} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>4</span>
              <span>12</span>
            </div>
          </div>

          {/* Traitor Count */}
          <div className="space-y-3">
            <Label className="text-destructive">Hain Sayısı: {traitorCount[0]}</Label>
            <Slider
              value={traitorCount}
              onValueChange={setTraitorCount}
              max={Math.floor(maxPlayers[0] / 2)}
              min={1}
              step={1}
              className="w-full"
            />
          </div>

          {/* Special Roles */}
          <div className="space-y-3">
            <Label className="text-accent">Özel Rol Sayısı: {specialRoleCount[0]}</Label>
            <Slider
              value={specialRoleCount}
              onValueChange={setSpecialRoleCount}
              max={4}
              min={0}
              step={1}
              className="w-full"
            />
          </div>

          {/* Time Settings */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-chart-2" />
              Süre Ayarları
            </Label>

            <div className="space-y-3">
              <div>
                <Label className="text-sm">Gece Süresi: {nightDuration[0]}s</Label>
                <Slider
                  value={nightDuration}
                  onValueChange={setNightDuration}
                  max={120}
                  min={30}
                  step={15}
                  className="w-full mt-1"
                />
              </div>

              <div>
                <Label className="text-sm">Gündüz Süresi: {dayDuration[0]}s</Label>
                <Slider
                  value={dayDuration}
                  onValueChange={setDayDuration}
                  max={300}
                  min={60}
                  step={30}
                  className="w-full mt-1"
                />
              </div>

              <div>
                <Label className="text-sm">Oylama Süresi: {voteDuration[0]}s</Label>
                <Slider
                  value={voteDuration}
                  onValueChange={setVoteDuration}
                  max={90}
                  min={30}
                  step={15}
                  className="w-full mt-1"
                />
              </div>
            </div>
          </div>

          {/* Card Profile */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              Kart Profili
            </Label>
            <Select value={cardProfile} onValueChange={(value: any) => setCardProfile(value)}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="STANDARD">Standart - Dengeli oyun</SelectItem>
                <SelectItem value="CHAOS">Kaos - Daha fazla etki</SelectItem>
                <SelectItem value="QUICK">Hızlı - Kısa turlar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
            İptal
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!roomName.trim()}
            className="flex-1 bg-primary hover:bg-primary/90 holographic-glow"
          >
            Oda Oluştur
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
