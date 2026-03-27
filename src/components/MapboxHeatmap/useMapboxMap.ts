import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const MAP_CENTER: [number, number] = [-73.58, 45.52]
const MAP_ZOOM = 11

export function useMapboxMap(containerRef: React.RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    try {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        antialias: true,
        failIfMajorPerformanceCaveat: false,
      })

      map.addControl(new mapboxgl.NavigationControl(), 'top-left')

      map.on('load', () => setIsLoaded(true))
      map.on('error', (e) => {
        console.warn('Mapbox error:', e.error?.message ?? e)
      })

      mapRef.current = map

      return () => {
        map.remove()
        mapRef.current = null
        setIsLoaded(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to create Mapbox map:', msg)
      setError(msg)
    }
  }, [containerRef])

  return { map: mapRef.current, isLoaded, error }
}
