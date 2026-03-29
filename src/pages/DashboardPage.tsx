import { useState, useEffect } from 'react'

import type { Dispatch, SetStateAction } from 'react'
import type { RouteStatus, Schedule } from '../types/dashboard'

import type { RouteOption, SummaryData } from '../hooks/useStmData'

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
  routeStatus: RouteStatus
  totalEvents: number
  peakHour: string
  routes: RouteOption[]
  summary: SummaryData | null
  dataLoading: boolean
  dataError: string | null
  onStart: () => void
  onEnd: () => void
  onOpenSuggestions: () => void
  onOpenHeatmapSuggestion: () => void
  onLogout: () => void
}

export default function DashboardPage({
  schedule,
  setSchedule,
  routeStatus,
  totalEvents,
  peakHour,
  routes,
  summary,
  dataLoading,
  dataError,
  onStart,
  onEnd,
  onOpenSuggestions,
  onOpenHeatmapSuggestion,
  onLogout,
}: DashboardPageProps) {
  const routeLabels = routes.length > 0 ? routes.map((r) => r.label) : ['Loading...']
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  // Set default route selections when routes load
  useEffect(() => {
    if (routes.length > 0 && !routeFrom) {
      setRouteFrom(routes[0].label)
      if (routes.length > 1) setRouteTo(routes[1].label)
    }
  }, [routes, routeFrom])

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
          <button className="btn ghost sm" onClick={onOpenSuggestions}>
            Suggestions
          </button>
          <button className="btn ghost sm" onClick={onOpenHeatmapSuggestion}>
            Heatmap
          </button>
          <button className="btn ghost sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {dataError && (
        <div className="auth-error" style={{ textAlign: 'center' }}>
          API Error: {dataError}
        </div>
      )}

      <section className="kpi-grid">
        <article className="kpi-card blue">
          <p className="kpi-label">Total Stops</p>
          <p className="kpi-value cyan">
            {dataLoading ? '...' : (summary?.totalStops?.toLocaleString() ?? '-')}
          </p>
          <p className="muted">{summary?.totalRoutes ? `Across ${summary.totalRoutes} routes` : 'Loading...'}</p>
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
          <p className="kpi-value amber">
            {dataLoading ? '...' : totalEvents.toLocaleString()}
          </p>
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
              {routeLabels.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <span className="route-arrow">-&gt;</span>
          <label>
            To Route
            <select value={routeTo} onChange={(e) => setRouteTo(e.target.value)}>
              {routeLabels.map((r) => (
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

      {summary?.busiestStops && summary.busiestStops.length > 0 && (
        <section className="route-planner-card">
          <div className="card-title-row">
            <h2>Busiest Stops</h2>
            <span className="card-badge">By Trip Count</span>
          </div>
          <div className="busiest-stops-list">
            {summary.busiestStops.map((stop, i) => (
              <div key={stop.stop_id} className="busiest-stop-row">
                <span className="busiest-stop-rank">#{i + 1}</span>
                <span className="busiest-stop-name">{stop.stop_name}</span>
                <span className="busiest-stop-count">{stop.trip_count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}


    </main>
  )
}
