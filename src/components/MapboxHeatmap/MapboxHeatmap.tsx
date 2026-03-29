import { useRef } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import './MapboxHeatmap.css'
import { useMapboxMap } from './useMapboxMap'
import { useHeatmapLayer } from './useHeatmapLayer'
import { useTimeAnimation } from './useTimeAnimation'
import type { MapHeatmapProps } from './types'

const TICK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 23]

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

export default function MapboxHeatmap({ className }: MapHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, isLoaded, error: mapError } = useMapboxMap(containerRef)
  const { hour, isPlaying, togglePlay, setHour, stopPlay } = useTimeAnimation()
  const stats = useHeatmapLayer(map, isLoaded, hour)

  if (!MAPBOX_TOKEN) {
    return (
      <div className="map-no-token">
        <div>
          <p>Mapbox token not configured.</p>
          <code>VITE_MAPBOX_TOKEN=pk.your_token</code>
          <p>Add this to your .env file and restart the dev server.</p>
        </div>
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="map-no-token">
        <div>
          <p>Map failed to initialize: {mapError}</p>
          <p>Try opening in Chrome/Firefox with hardware acceleration enabled.</p>
          <p>Or check chrome://gpu for WebGL status.</p>
        </div>
      </div>
    )
  }

  const sliderPct = (hour / 23) * 100
  const sliderBg = `linear-gradient(to right, var(--cyan) ${sliderPct}%, var(--bg3) ${sliderPct}%)`

  return (
    <div className={`mapbox-heatmap-container ${className ?? ''}`}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Stats HUD */}
      <div className="map-stats-hud">
        <div className="map-stat">
          <span className="map-stat-label">Total Trips</span>
          <span className="map-stat-value">
            {stats.totalTrips > 0 ? stats.totalTrips.toLocaleString() : '--'}
          </span>
        </div>
        <div className="map-stat">
          <span className="map-stat-label">Active Zones</span>
          <span className="map-stat-value">
            {stats.activeHexes > 0 ? stats.activeHexes.toLocaleString() : '--'}
          </span>
        </div>
        <div className="map-stat">
          <span className="map-stat-label">Peak Density</span>
          <span className="map-stat-value">
            {stats.maxDensity > 0 ? stats.maxDensity.toLocaleString() : '--'}
          </span>
        </div>
      </div>

      {/* Busyness Legend */}
      <div className="map-legend">
        <span className="map-legend-label">Busy</span>
        <div className="map-legend-bar" />
        <span className="map-legend-label">Quiet</span>
      </div>

      {/* Time controls */}
      <div className="map-time-controls">
        <button className="map-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <input
          type="range"
          className="map-time-slider"
          min={0}
          max={23}
          value={hour}
          step={1}
          style={{ background: sliderBg }}
          onChange={(e) => {
            stopPlay()
            setHour(Number(e.target.value))
          }}
        />
        <span className="map-hour-label">{String(hour).padStart(2, '0')}:00</span>
      </div>

      {/* Tick marks - positioned below controls but inside container */}
      {stats.activeHexes === 0 && isLoaded && (
        <div className="map-no-data">Awaiting data</div>
      )}
    </div>
  )
}
