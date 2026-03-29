import { useState, useEffect } from 'react'
import type { Suggestion, AvailableResource } from '../types/dashboard'

type SuggestionsPageProps = {
  onBack: () => void
  onLogout: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  bottleneck: 'Bottleneck',
  'connection-miss': 'Missed Transfer',
  'schedule-gap': 'Schedule Gap',
  'late-schedule': 'Late Schedule',
}

const CATEGORY_COLORS: Record<string, string> = {
  bottleneck: 'var(--cyan)',
  'connection-miss': 'var(--red)',
  'schedule-gap': 'var(--amber)',
  'late-schedule': '#8b5cf6',
}

export default function SuggestionsPage({ onBack, onLogout }: SuggestionsPageProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [resources, setResources] = useState<AvailableResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSuggestions = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('http://localhost:3001/api/suggestions')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setSuggestions(data.suggestions ?? [])
      setResources(data.availableResources ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuggestions() }, [])

  const totalBuses = resources.reduce((s, r) => s + r.busesAvailable, 0)

  return (
    <main className="dash-wrap">
      <header className="dash-header">
        <div className="dash-header-left">
          <img className="stm-logo small" src="/stm-logo.svg" alt="STM" />
          <div className="dash-title">
            <p className="eyebrow">Transit Intelligence</p>
            <h1>Optimization Suggestions</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn ghost sm" onClick={onBack}>
            Back to Dashboard
          </button>
          <button className="btn ghost sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {/* KPI row */}
      {!loading && !error && suggestions.length > 0 && (
        <div className="kpi-row" style={{ marginBottom: '1rem' }}>
          <div className="kpi-card">
            <span className="kpi-label">Total Actions</span>
            <span className="kpi-value" style={{ color: 'var(--cyan)' }}>
              {suggestions.length}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Connection Misses</span>
            <span className="kpi-value" style={{ color: 'var(--red)' }}>
              {suggestions.filter(s => s.category === 'connection-miss').length}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Buses Available for Reallocation</span>
            <span className="kpi-value" style={{ color: 'var(--green)' }}>
              {totalBuses}
            </span>
          </div>
        </div>
      )}

      {/* Main suggestions table */}
      <section className="suggestions-table-card">
        <div className="card-title-row">
          <h2>Action Recommendations</h2>
          <span className="card-badge">Ranked by Rage Score</span>
        </div>

        {loading && (
          <div className="suggestions-loading">
            <div className="spinner" />
            <p className="muted">Analyzing transit data...</p>
          </div>
        )}

        {error && (
          <div className="suggestions-error">
            <p>Failed to load: {error}</p>
            <button className="btn primary sm" onClick={fetchSuggestions}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <p className="muted">No suggestions generated yet.</p>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <div className="suggestions-table-wrap">
            <table className="suggestions-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Projected Outcome</th>
                  <th className="rage-col">Rage Points</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="suggestion-action-cell">
                        <span
                          className="suggestion-category-pill"
                          style={{ background: CATEGORY_COLORS[s.category] }}
                        >
                          {CATEGORY_LABELS[s.category]}
                        </span>
                        <span className="suggestion-action-text">{s.action}</span>
                      </div>
                    </td>
                    <td>{s.projectedOutcome}</td>
                    <td className="rage-cell">
                      <span className="rage-score-value">
                        {Math.round(s.rageScore).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Available Resources table */}
      {!loading && !error && resources.length > 0 && (
        <section className="suggestions-table-card" style={{ marginTop: '1.5rem' }}>
          <div className="card-title-row">
            <h2>Available Resources for Reallocation</h2>
            <span className="card-badge resource-badge">{totalBuses} buses free</span>
          </div>
          <p className="muted">Underused lines with spare capacity ready to be reassigned to high-demand routes.</p>

          <div className="suggestions-table-wrap">
            <table className="suggestions-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Current Usage</th>
                  <th>Depot Location</th>
                  <th className="rage-col">Buses Available</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.routeId}>
                    <td>
                      <span className="suggestion-action-text">
                        Route {r.routeId}
                      </span>
                      <br />
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{r.routeName}</span>
                    </td>
                    <td>
                      <span>{r.currentTrips.toLocaleString()} trips</span>
                      <br />
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        Network avg: {r.avgTrips.toLocaleString()}
                      </span>
                    </td>
                    <td>{r.depot}</td>
                    <td className="rage-cell">
                      <span className="resource-count">{r.busesAvailable}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
