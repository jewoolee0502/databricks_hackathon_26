import MapboxHeatmap from '../components/MapboxHeatmap/MapboxHeatmap'

type HeatmapSuggestionPageProps = {
  onBack: () => void
  onLogout: () => void
}

export default function HeatmapSuggestionPage({ onBack, onLogout }: HeatmapSuggestionPageProps) {
  return (
    <main className="dash-wrap">
      <header className="dash-header">
        <div className="dash-header-left">
          <img className="stm-logo small" src="/stm-logo.svg" alt="STM" />
          <div className="dash-title">
            <p className="eyebrow">Heatmap</p>
            <h1>Heatmap Page</h1>
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

      <section className="map-card">
        <div className="card-title-row">
          <h2>Montreal Transit Heatmap</h2>
          <span className="card-badge">Frequency Map</span>
        </div>
        <p className="muted">
          Hourly trip density across the STM network. Use the timeline to explore patterns.
        </p>
        <MapboxHeatmap />
      </section>
    </main>
  )
}
