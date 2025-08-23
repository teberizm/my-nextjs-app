"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { QrCode, Camera, Keyboard, AlertCircle } from "lucide-react"

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onCardScanned: (cardId: string) => void
  playerName: string
}

export function QRScanner({ isOpen, onClose, onCardScanned, playerName }: QRScannerProps) {
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera")
  const [manualCode, setManualCode] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState("")

  // Simulate QR scanning
  const simulateQRScan = () => {
    setIsScanning(true)
    setError("")

    // Simulate scanning delay
    setTimeout(() => {
      // Simulate random card detection
      const sampleCards = ["KRT-0001", "KRT-0002", "KRT-0010", "KRT-0020", "KRT-0030"]
      const randomCard = sampleCards[Math.floor(Math.random() * sampleCards.length)]

      setIsScanning(false)
      onCardScanned(randomCard)
    }, 2000)
  }

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      setError("Kart kodunu girin")
      return
    }

    // Validate card code format
    if (!/^KRT-\d{4}$/.test(manualCode.toUpperCase())) {
      setError("Geçersiz kart kodu formatı (örn: KRT-0001)")
      return
    }

    setError("")
    onCardScanned(manualCode.toUpperCase())
  }

  const resetState = () => {
    setManualCode("")
    setError("")
    setIsScanning(false)
    setScanMode("camera")
  }

  useEffect(() => {
    if (!isOpen) {
      resetState()
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-work-sans">
            <QrCode className="w-5 h-5 text-primary" />
            Kart QR Okut
          </DialogTitle>
          <DialogDescription>{playerName}, fiziksel kartındaki QR kodu okut</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              variant={scanMode === "camera" ? "default" : "outline"}
              onClick={() => setScanMode("camera")}
              className="flex-1"
            >
              <Camera className="w-4 h-4 mr-2" />
              Kamera
            </Button>
            <Button
              variant={scanMode === "manual" ? "default" : "outline"}
              onClick={() => setScanMode("manual")}
              className="flex-1"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Manuel
            </Button>
          </div>

          {/* Camera Mode */}
          {scanMode === "camera" && (
            <Card className="border-secondary/30">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  {!isScanning ? (
                    <>
                      <div className="w-32 h-32 border-2 border-dashed border-secondary rounded-lg flex items-center justify-center mx-auto">
                        <QrCode className="w-16 h-16 text-secondary" />
                      </div>
                      <p className="text-sm text-muted-foreground">Kartındaki QR kodu kamera ile okut</p>
                      <Button
                        onClick={simulateQRScan}
                        className="w-full bg-secondary hover:bg-secondary/90 holographic-glow"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        QR Okutmaya Başla
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="w-32 h-32 border-2 border-secondary rounded-lg flex items-center justify-center mx-auto pulse-glow">
                        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-secondary font-medium">QR kod aranıyor...</p>
                      <p className="text-sm text-muted-foreground">Kartı kameraya net bir şekilde gösterin</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manual Mode */}
          {scanMode === "manual" && (
            <Card className="border-accent/30">
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label htmlFor="cardCode">Kart Kodu</Label>
                  <Input
                    id="cardCode"
                    placeholder="KRT-0001"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    className="bg-input border-border font-mono text-center"
                    maxLength={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Kartın üzerindeki kodu girin (örn: KRT-0001)</p>
                </div>

                <Button
                  onClick={handleManualSubmit}
                  disabled={!manualCode.trim()}
                  className="w-full bg-accent hover:bg-accent/90 holographic-glow"
                >
                  Kart Kodunu Onayla
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Instructions */}
          <Card className="bg-muted/10 border-muted/30">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Fiziksel kartı desteden çek</p>
                <p>• QR kodu temiz ve net olmalı</p>
                <p>• Her kart sadece bir kez kullanılabilir</p>
                <p>• Kart etkisi hemen uygulanacak</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
            İptal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
