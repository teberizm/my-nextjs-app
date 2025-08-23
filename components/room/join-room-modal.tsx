"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { QrCode, Users } from "lucide-react"

interface JoinRoomModalProps {
  onJoinRoom: (roomCode: string, playerName: string) => void
  children: React.ReactNode
}

export function JoinRoomModal({ onJoinRoom, children }: JoinRoomModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [roomCode, setRoomCode] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [isScanning, setIsScanning] = useState(false)

  const handleJoin = () => {
    if (roomCode.trim() && playerName.trim()) {
      onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim())
      setIsOpen(false)
      setRoomCode("")
      setPlayerName("")
    }
  }

  const handleQRScan = () => {
    setIsScanning(true)
    // QR scanning logic would go here
    // For now, simulate scanning
    setTimeout(() => {
      setRoomCode("DEMO123")
      setIsScanning(false)
    }, 2000)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-work-sans">
            <Users className="w-5 h-5 text-secondary" />
            Oyuna Katıl
          </DialogTitle>
          <DialogDescription>QR kod okutun veya oda kodunu girin</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Player Name */}
          <div className="space-y-2">
            <Label htmlFor="playerName">Oyuncu Adınız</Label>
            <Input
              id="playerName"
              placeholder="Adınızı girin..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="bg-input border-border"
              maxLength={20}
            />
          </div>

          {/* QR Scanner */}
          <div className="space-y-3">
            <Label>QR Kod Okut</Label>
            <Button
              variant="outline"
              onClick={handleQRScan}
              disabled={isScanning}
              className="w-full h-20 border-secondary text-secondary hover:bg-secondary/10 bg-transparent border-dashed"
            >
              {isScanning ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                  <span>QR Kod Aranıyor...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <QrCode className="w-8 h-8" />
                  <span>QR Kod Okut</span>
                </div>
              )}
            </Button>
          </div>

          {/* Manual Room Code */}
          <div className="space-y-2">
            <Label htmlFor="roomCode">Veya Oda Kodunu Girin</Label>
            <Input
              id="roomCode"
              placeholder="Örn: ABC123"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="bg-input border-border text-center font-mono text-lg tracking-wider"
              maxLength={6}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
            İptal
          </Button>
          <Button
            onClick={handleJoin}
            disabled={!roomCode.trim() || !playerName.trim()}
            className="flex-1 bg-secondary hover:bg-secondary/90 holographic-glow"
          >
            Katıl
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
