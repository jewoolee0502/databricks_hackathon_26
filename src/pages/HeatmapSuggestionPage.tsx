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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button className="btn ghost sm" onClick={onBack}>
            Back to Dashboard
          </button>
          <button className="btn ghost sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="suggestion-card">
        <h2>Coming Soon</h2>
        <p className="muted">This page is intentionally empty for now.</p>
      </section>
    </main>
  )
}
