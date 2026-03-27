import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { HourlyStats } from './types'

const API_BASE = 'http://localhost:3001/api'
const SOURCE_ID = 'heatmap-source'
const HEATMAP_LAYER_ID = 'heatmap-layer'
const CIRCLE_LAYER_ID = 'circle-layer'

type GeoJSONData = GeoJSON.FeatureCollection<GeoJSON.Point>

const EMPTY_FC: GeoJSONData = { type: 'FeatureCollection', features: [] }

export function useHeatmapLayer(
  map: mapboxgl.Map | null,
  isLoaded: boolean,
  hour: number,
) {
  const cacheRef = useRef<Map<number, GeoJSONData>>(new Map())
  const [stats, setStats] = useState<HourlyStats>({ totalTrips: 0, maxDensity: 0, activeHexes: 0 })
  const layersAddedRef = useRef(false)

  // Add source and layers once
  useEffect(() => {
    if (!map || !isLoaded || layersAddedRef.current) return

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_FC,
    })

    map.addLayer({
      id: HEATMAP_LAYER_ID,
      type: 'heatmap',
      source: SOURCE_ID,
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.8,
          10, 2,
          14, 4,
        ],
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 4,
          7, 16,
          10, 28,
          14, 50,
        ],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, '#eaf2ff',
          0.25, '#d9e9ff',
          0.4, '#bdd9ff',
          0.55, '#93beff',
          0.7, '#5f9dff',
          0.85, '#2f7af5',
          1.0, '#1570ef',
        ],
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 0.9,
          15, 0.3,
        ],
      },
    })

    map.addLayer({
      id: CIRCLE_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      minzoom: 13,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 3,
          16, 10,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'weight'],
          0, '#d9e9ff',
          0.5, '#5f9dff',
          1.0, '#1570ef',
        ],
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 0,
          14, 0.85,
        ],
        'circle-stroke-width': 0,
      },
    })

    // Hover popup for circles
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })

    map.on('mouseenter', CIRCLE_LAYER_ID, (e) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const count = feature.properties?.count ?? 0
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
      popup
        .setLngLat([lng, lat])
        .setHTML(
          `<span style="font:12px var(--mono, monospace);color:var(--text, #122b46)">${Number(count).toLocaleString()} trips</span>`,
        )
        .addTo(map)
    })

    map.on('mouseleave', CIRCLE_LAYER_ID, () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    })

    layersAddedRef.current = true
  }, [map, isLoaded])

  // Fetch and update data on hour change
  useEffect(() => {
    if (!map || !isLoaded || !layersAddedRef.current) return

    let cancelled = false

    async function fetchHour(h: number): Promise<GeoJSONData> {
      const cached = cacheRef.current.get(h)
      if (cached) return cached
      try {
        const res = await fetch(`${API_BASE}/heatmap/${h}`)
        if (!res.ok) return EMPTY_FC
        const data = (await res.json()) as GeoJSONData
        cacheRef.current.set(h, data)
        return data
      } catch {
        return EMPTY_FC
      }
    }

    async function update() {
      const data = await fetchHour(hour)
      if (cancelled) return

      const source = map!.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
      if (source) source.setData(data)

      // Compute stats
      const features = data.features
      let total = 0
      let max = 0
      for (const f of features) {
        const count = (f.properties?.count as number) ?? 0
        total += count
        if (count > max) max = count
      }
      setStats({
        totalTrips: total,
        maxDensity: max,
        activeHexes: features.length,
      })

      // Prefetch adjacent hours
      const prefetchTargets = [(hour + 1) % 24, (hour + 2) % 24, (hour + 23) % 24]
      prefetchTargets.forEach((h) => {
        if (!cacheRef.current.has(h)) fetchHour(h)
      })
    }

    update()

    return () => {
      cancelled = true
    }
  }, [map, isLoaded, hour])

  return stats
}
