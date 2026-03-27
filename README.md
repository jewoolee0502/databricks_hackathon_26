# databricks_hackathon_26

STM frequency monitoring web app starter for Databricks Hackathon Montreal 2026.

## Frontend stack

- React + TypeScript + Vite
- Responsive dashboard UI with heatmap visualization

## Implemented so far

- Login page that gates access to dashboard
- Dashboard with:
  - Heatmap visualization (day x hour frequency matrix)
  - Date and time picker controls
  - Start Route and End Route action buttons
  - Station selector and quick summary metrics
- Production build validated with `npm run build`

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Real login setup

Create a `.env` file in the project root (or copy from `.env.example`) and configure:

```bash
VITE_AUTH_API_BASE_URL=http://localhost:8000
```

Frontend login calls:

- `POST /auth/login`
- JSON body: `{ "email": "...", "password": "..." }`
- Expected JSON response: `{ "token": "jwt-or-session-token" }`

If the API is unavailable or unreachable, the app automatically falls back to local browser auth:

- Create User stores credentials in `localStorage`
- Sign In validates against locally stored credentials
- Session token is stored in `localStorage`

## Suggested next frontend improvements

- Connect heatmap and controls to backend APIs using a typed API client
- Add route timeline panel (events, delays, incidents)
- Add map view synchronized with selected station and route status
- Add alert thresholds and color legend customization
- Add historical comparison mode (today vs last week)
- Add role-based UI (operator, supervisor, admin)
- Add live mode via WebSocket or SSE for near real-time frequency updates
- Add export options (CSV, PNG snapshot, shareable dashboard link)
