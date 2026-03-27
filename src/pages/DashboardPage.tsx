import { useState, useEffect } from 'react'
import HeatmapGrid from '../components/HeatmapGrid'
import type { Dispatch, SetStateAction } from 'react'
import type { HeatmapDataset, RouteStatus, Schedule } from '../types/dashboard'

const STM_ROUTES = ['24 Sherbrooke', '80 Du Parc', '55 Saint-Laurent', '121 Sauve/Cote-Vertu']

const TOD_WINDOWS = [
  { id: 'all', label: 'All Day', hours: null },
  { id: 'night', label: '00-05', hours: [0, 5] as [number, number] },
  { id: 'am-rush', label: '06-09', hours: [6, 9] as [number, number] },
  { id: 'midday', label: '10-14', hours: [10, 14] as [number, number] },
  { id: 'pm-rush', label: '15-18', hours: [15, 18] as [number, number] },
  { id: 'evening', label: '19-23', hours: [19, 23] as [number, number] },
]

function RouteStatusPill({ status }: { status: RouteStatus }) {
  const labels: Record<RouteStatus, string> = {
    idle: 'Idle',
    active: 'Active',
    ended: 'Ended',
  }
  return (
    <span className={`status-pill ${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  )
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="header-time">
      {time.toLocaleString('en-CA', {
        timeZone: 'America/Montreal',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })}{' '}
      EST
    </span>
  )
}

type DashboardPageProps = {
  schedule: Schedule
  setSchedule: Dispatch<SetStateAction<Schedule>>
  selectedHeatmapId: HeatmapDataset['id']
  onHeatmapChange: (next: HeatmapDataset['id']) => void
  heatmapDatasets: HeatmapDataset[]
  routeStatus: RouteStatus
  totalEvents: number
  peakHour: string
  onStart: () => void
  onEnd: () => void
  onLogout: () => void
}

export default function DashboardPage({
  schedule,
  setSchedule,
  selectedHeatmapId,
  onHeatmapChange,
  heatmapDatasets,
  routeStatus,
  totalEvents,
  peakHour,
  onStart,
  onEnd,
  onLogout,
}: DashboardPageProps) {
  const [routeFrom, setRouteFrom] = useState(STM_ROUTES[0])
  const [routeTo, setRouteTo] = useState(STM_ROUTES[1])
  const [todFilter, setTodFilter] = useState('all')

  const selectedHeatmap =
    heatmapDatasets.find((d) => d.id === selectedHeatmapId) ?? heatmapDatasets[0]

  const activeTod = TOD_WINDOWS.find((w) => w.id === todFilter) ?? TOD_WINDOWS[0]

  const statusEmoji: Record<RouteStatus, string> = { idle: '---', active: 'ON', ended: 'OFF' }

  return (
    <main className="dash-wrap">
      <header className="dash-header">
        <div className="dash-header-left">
          <img className="stm-logo small" src="/stm-logo.svg" alt="STM" />
          <div className="dash-title">
            <p className="eyebrow">Operations Console</p>
            <h1>STM Frequency Monitoring Dashboard</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="header-live">
            <span className="live-dot" />
            <span className="live-label">Live</span>
            <LiveClock />
          </div>
          <button className="btn ghost sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="kpi-grid">
        <article className="kpi-card blue">
          <p className="kpi-label">Active Heatmap</p>
          <p className="kpi-value cyan" style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>
            {selectedHeatmap?.title?.split(' ').slice(0, 3).join(' ') ?? '-'}
          </p>
          <p className="muted">Current dataset in focus</p>
        </article>
        <article className="kpi-card green">
          <p className="kpi-label">Route Status</p>
          <p
            className={`kpi-value ${
              routeStatus === 'active' ? 'green' : routeStatus === 'ended' ? 'amber' : ''
            }`}
          >
            {statusEmoji[routeStatus]}
          </p>
          <p className="muted">
            {routeStatus === 'idle'
              ? 'Monitoring is not started'
              : routeStatus === 'active'
                ? 'Route monitoring in progress'
                : 'Route monitoring ended'}
          </p>
        </article>
        <article className="kpi-card amber">
          <p className="kpi-label">Total Events</p>
          <p className="kpi-value amber">{totalEvents.toLocaleString()}</p>
          <p className="muted">Peak hour: {peakHour}</p>
        </article>
      </section>

      <section className="route-planner-card">
        <div className="card-title-row">
          <h2>Route Planner</h2>
          <span className="card-badge">Route Window</span>
        </div>
        <div className="route-selectors">
          <label>
            From Route
            <select value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)}>
              {STM_ROUTES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <span className="route-arrow">-&gt;</span>
          <label>
            To Route
            <select value={routeTo} onChange={(e) => setRouteTo(e.target.value)}>
              {STM_ROUTES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className="btn ghost" style={{ alignSelf: 'flex-end' }} onClick={() => {}}>
            Save Route
          </button>
        </div>
        <div className="schedule-grid">
          <label>
            Start Date-Time
            <input
              type="datetime-local"
              value={schedule.startDateTime}
              onChange={(e) => setSchedule((p) => ({ ...p, startDateTime: e.target.value }))}
            />
          </label>
          <label>
            End Date-Time
            <input
              type="datetime-local"
              value={schedule.endDateTime}
              onChange={(e) => setSchedule((p) => ({ ...p, endDateTime: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="controls-card">
        <div className="card-title-row">
          <h2>Route Controls</h2>
          <RouteStatusPill status={routeStatus} />
        </div>
        <div className="controls-inner">
          <button className="btn primary" onClick={onStart} disabled={routeStatus === 'active'}>
            Start Route
          </button>
          <button className="btn warn" onClick={onEnd} disabled={routeStatus !== 'active'}>
            End Route
          </button>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Selected: {routeFrom} -&gt; {routeTo}
          </span>
        </div>
      </section>

      <section className="heatmap-card">
        <div className="heatmap-top">
          <div>
            <div className="card-title-row">
              <h2>{selectedHeatmap?.title ?? 'Frequency Heatmap'}</h2>
            </div>
            <p className="heatmap-desc">{selectedHeatmap?.description}</p>
          </div>

          <div className="tabs-row" role="tablist" aria-label="Heatmap selection">
            {heatmapDatasets.map((dataset) => (
              <button
                key={dataset.id}
                type="button"
                role="tab"
                aria-selected={selectedHeatmapId === dataset.id}
                className={`tab-btn ${selectedHeatmapId === dataset.id ? 'active' : ''}`}
                onClick={() => onHeatmapChange(dataset.id)}
              >
                {dataset.id === 'route-hour' ? 'Route by Hour' : 'Stop Sequence by Hour'}
              </button>
            ))}
          </div>
        </div>

        <div className="tod-filter">
          <span className="tod-label">Filter:</span>
          <div className="tod-chips">
            {TOD_WINDOWS.map((w) => (
              <button
                key={w.id}
                className={`tod-chip ${todFilter === w.id ? 'active' : ''}`}
                onClick={() => setTodFilter(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {selectedHeatmap && <HeatmapGrid dataset={selectedHeatmap} todRange={activeTod.hours} />}

        <div className="heatmap-legend">
          <span className="legend-label">Low</span>
          <div className="legend-cells">
            {['l0', 'l1', 'l2', 'l3', 'l4', 'l5'].map((l) => (
              <div key={l} className={`legend-cell cell ${l}`} />
            ))}
          </div>
          <span className="legend-label">High</span>
        </div>
      </section>

      <section className="map-card">
        <div className="card-title-row">
          <h2>Montreal Bus Network</h2>
          <span className="card-badge">Live Context Map</span>
        </div>
        <p className="muted">
          Montreal network context for STM bus operations.
        </p>
        <div className="map-frame-wrap">
          <iframe
            title="Montreal map"
            className="map-frame"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-73.91%2C45.42%2C-73.35%2C45.72&layer=mapnik"
          />
        </div>
      </section>
    </main>
  )
}
