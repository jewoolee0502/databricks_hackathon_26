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
      maxzoom: 16,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.3,
          10, 0.8,
          13, 1.2,
          15, 1.5,
        ],
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2,
          7, 8,
          10, 14,
          13, 20,
          15, 25,
        ],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.05, '#f0fdf4',
          0.15, '#bbf7d0',
          0.3, '#86efac',
          0.45, '#fde047',
          0.6, '#facc15',
          0.75, '#f97316',
          0.9, '#ef4444',
          1.0, '#991b1b',
        ],
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 0.85,
          16, 0.25,
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
          13, 4,
          16, 10,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'weight'],
          0, '#bbf7d0',
          0.3, '#fde047',
          0.6, '#f97316',
          1.0, '#991b1b',
        ],
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 0,
          14, 0.9,
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    })

    // Hover popup for circles
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '320px',
      offset: 12,
    })

    map.on('mouseenter', CIRCLE_LAYER_ID, (e) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const props = feature.properties ?? {}
      const count = Number(props.count ?? 0)
      const stopName = props.stop_name || 'Unknown Stop'
      const stopId = props.stop_id || '--'
      const routes = props.routes || ''
      const weight = Number(props.weight ?? 0)
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates

      // Busyness label
      let busyness = 'Low'
      let busynessColor = '#16a34a'
      if (weight > 0.75) { busyness = 'Very High'; busynessColor = '#991b1b' }
      else if (weight > 0.5) { busyness = 'High'; busynessColor = '#ea580c' }
      else if (weight > 0.25) { busyness = 'Medium'; busynessColor = '#ca8a04' }

      // Format routes as a list (limit to 5)
      const routeList = routes
        ? routes.split(', ').slice(0, 5).map((r: string) =>
            `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 6px;margin:1px 2px;font-size:11px;white-space:nowrap">${r}</span>`
          ).join('')
        : '<span style="color:#94a3b8;font-size:11px">--</span>'
      const totalRoutes = routes ? routes.split(', ').length : 0
      const moreLabel = totalRoutes > 5 ? `<span style="color:#64748b;font-size:10px;margin-left:2px">+${totalRoutes - 5} more</span>` : ''

      popup
        .setLngLat([lng, lat])
        .setHTML(`
          <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;min-width:200px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${stopName}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="font-size:11px;color:#64748b">Stop #${stopId}</span>
              <span style="display:inline-block;background:${busynessColor};color:#fff;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:600">${busyness}</span>
            </div>
            <div style="border-top:1px solid #e2e8f0;padding-top:6px;margin-bottom:4px">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Trips this hour</div>
              <div style="font-size:18px;font-weight:700;color:#0f172a">${count.toLocaleString()}</div>
            </div>
            <div style="border-top:1px solid #e2e8f0;padding-top:6px">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Bus Routes</div>
              <div style="display:flex;flex-wrap:wrap;gap:0">${routeList}${moreLabel}</div>
            </div>
          </div>
        `)
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
