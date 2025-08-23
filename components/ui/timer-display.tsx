"use client"

import { useEffect, useState } from "react"

interface TimerDisplayProps {
  duration: number
  onComplete?: () => void
  className?: string
}

export function TimerDisplay({ duration, onComplete, className = "" }: TimerDisplayProps) {
  const [timeLeft, setTimeLeft] = useState(duration)

  useEffect(() => {
    setTimeLeft(duration)
  }, [duration])

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.()
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onComplete?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, onComplete])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const percentage = (timeLeft / duration) * 100

  return (
    <div className={`relative ${className}`}>
      <div className="bg-gray-800 rounded-full h-3 overflow-hidden border border-purple-500/30">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-1000 ease-linear"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-center mt-2 font-mono text-lg text-cyan-400">
        {minutes}:{seconds.toString().padStart(2, "0")}
      </div>
    </div>
  )
}
