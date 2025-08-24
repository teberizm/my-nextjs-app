"use client"

import { useEffect, useRef } from "react"

export default function LeafletMap() {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: any
    const init = async () => {
      const L = (await import("leaflet")).default
      if (!mapRef.current) return
      map = L.map(mapRef.current).setView([0, 0], 2)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
      }).addTo(map)
    }
    init()
    return () => {
      if (map) {
        map.remove()
      }
    }
  }, [])

  return <div ref={mapRef} className="h-64 w-full" />
}
