'use client'

import { useEffect, useRef, useState } from 'react'

export interface KejaMapMarker {
  id: string
  latitude: number
  longitude: number
  label: string
  href?: string
}

interface KejaMapProps {
  markers?: KejaMapMarker[]
  className?: string
  selectable?: boolean
  selectedPoint?: { latitude: number; longitude: number } | null
  onPointSelect?: (point: { latitude: number; longitude: number }) => void
}

const KENYA_CENTER: [number, number] = [-0.0236, 37.9062]

export default function KejaMap({
  markers = [],
  className = '',
  selectable = false,
  selectedPoint = null,
  onPointSelect,
}: KejaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    let active = true
    let map: import('leaflet').Map | undefined

    async function initializeMap() {
      try {
        const L = await import('leaflet')
        if (!active || !containerRef.current) return

        map = L.map(containerRef.current, { scrollWheelZoom: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map)

        const points = markers.map((marker) => [marker.latitude, marker.longitude] as [number, number])
        if (selectedPoint) points.push([selectedPoint.latitude, selectedPoint.longitude])

        if (points.length === 0) {
          map.setView(KENYA_CENTER, 6)
        } else if (points.length === 1) {
          map.setView(points[0], selectable ? 13 : 12)
        } else {
          map.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 13 })
        }

        markers.forEach((marker, index) => {
          const icon = L.divIcon({
            className: '',
            html: `<span class="keja-map-marker">${index + 1}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })
          const leafletMarker = L.marker([marker.latitude, marker.longitude], { icon }).addTo(map!)
          if (marker.href) {
            const popup = document.createElement('div')
            const link = document.createElement('a')
            link.href = marker.href
            link.textContent = marker.label
            link.className = 'font-semibold text-blue-700 underline'
            popup.append(link)
            leafletMarker.bindPopup(popup)
          } else {
            const label = document.createElement('span')
            label.textContent = marker.label
            leafletMarker.bindTooltip(label)
          }
        })

        if (selectedPoint) {
          L.circleMarker([selectedPoint.latitude, selectedPoint.longitude], {
            radius: 9,
            color: '#065f46',
            fillColor: '#34d399',
            fillOpacity: 0.9,
          }).addTo(map)
        }

        if (selectable && onPointSelect) {
          map.on('click', (event) => onPointSelect({
            latitude: Number(event.latlng.lat.toFixed(6)),
            longitude: Number(event.latlng.lng.toFixed(6)),
          }))
        }
        window.setTimeout(() => map?.invalidateSize(), 0)
      } catch (error) {
        console.error('Could not initialize MTAA map:', error)
        if (active) setMapError('The map could not be loaded. Check your internet connection and try again.')
      }
    }

    void initializeMap()
    return () => {
      active = false
      map?.remove()
    }
  }, [markers, onPointSelect, selectable, selectedPoint])

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-100 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[300px] w-full" aria-label="Map of approximate listing locations" />
      {mapError && <p role="alert" className="absolute inset-x-4 bottom-4 rounded-lg bg-white p-3 text-sm text-red-800 shadow">{mapError}</p>}
    </div>
  )
}
