import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import {
  clearSession,
  loadSession,
  loginWithApi,
  registerWithApi,
  saveSession,
} from './services/auth'
import type {
  AuthMode,
  HeatmapDataset,
  LoginFormData,
  RouteStatus,
  Schedule,
} from './types/dashboard'

const hourLabels = Array.from({ length: 24 }, (_, hour) => `${`${hour}`.padStart(2, '0')}`)
const topBusRoutes = [
  '24 Sherbrooke',
  '80 Du Parc',
  '55 Saint-Laurent',
  '121 Sauve/Cote-Vertu',
  '67 Saint-Michel',
  '105 Sherbrooke',
  '139 Pie-IX',
  '18 Beaubien',
  '125 Ontario',
  '141 Jean-Talon Est',
  '129 Cote-Sainte-Catherine',
  '90 Saint-Jacques',
  '51 Edouard-Montpetit',
  '64 Grenet',
  '150 Rene-Levesque',
  '168 Cite-du-Havre',
  '69 Gouin',
  '107 Verdun',
  '470 Express Pierrefonds',
  '747 Aeroport/P.-E.-Trudeau',
]
const stopSequenceLabels = Array.from({ length: 30 }, (_, idx) => `Stop ${idx + 1}`)

function toInputDateTime(date: Date) {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function createRouteHourHeatmap() {
  return topBusRoutes.map((_, routeIdx) =>
    Array.from({ length: 24 }, (_, hourIndex) => {
      const morningRush = hourIndex >= 7 && hourIndex <= 9 ? 160 : 0
      const eveningRush = hourIndex >= 15 && hourIndex <= 18 ? 220 : 0
      const overnightDrop = hourIndex <= 4 ? -120 : 0
      const routeWeight = (20 - routeIdx) * 14
      const baseline = 75 + routeWeight

      return Math.max(
        10,
        baseline + morningRush + eveningRush + overnightDrop,
      )
    }),
  )
}

function createStopSequenceHourHeatmap() {
  return stopSequenceLabels.map((_, stopIdx) => {
    const stopMultiplier = 1 - stopIdx * 0.012

    return Array.from({ length: 24 }, (_, hourIndex) => {
      const rushAmplitude =
        hourIndex === 16
          ? 17000
          : hourIndex >= 15 && hourIndex <= 18
            ? 13000
            : hourIndex >= 7 && hourIndex <= 9
              ? 9000
              : hourIndex <= 4
                ? 1300
                : 5400
      const variation = (stopIdx % 5) * 120
      return Math.round(Math.max(350, rushAmplitude * stopMultiplier + variation))
    })
  })
}

const heatmapDatasets: HeatmapDataset[] = [
  {
    id: 'route-hour',
    title: 'Transit Trip Intensity by Route and Hour',
    description:
      'Top 20 STM bus routes by hour. Rush-hour peaks are strongest around 07-09 and 15-18, especially near 16-17.',
    xLabels: hourLabels,
    yLabels: topBusRoutes,
    values: createRouteHourHeatmap(),
    valueLabel: 'Trips',
  },
  {
    id: 'stop-sequence-hour',
    title: 'Departure Activity by Stop Sequence and Hour',
    description:
      'Departures by stop position (1-30) and hour. First stops show highest departure concentration around 16:00.',
    xLabels: hourLabels,
    yLabels: stopSequenceLabels,
    values: createStopSequenceHourHeatmap(),
    valueLabel: 'Departures',
  },
]

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' })
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle')
  const [selectedHeatmapId, setSelectedHeatmapId] = useState<HeatmapDataset['id']>('route-hour')

  const now = useMemo(() => new Date(), [])
  const oneHourAgo = useMemo(() => new Date(now.getTime() - 60 * 60 * 1000), [now])
  const [schedule, setSchedule] = useState<Schedule>({
    startDateTime: toInputDateTime(oneHourAgo),
    endDateTime: toInputDateTime(now),
  })

  useEffect(() => {
    const existingSession = loadSession()
    if (existingSession?.token) {
      setIsLoggedIn(true)
      setFormData((prev) => ({ ...prev, email: existingSession.email }))
    }
  }, [])

  const selectedHeatmap = useMemo(
    () => heatmapDatasets.find((dataset) => dataset.id === selectedHeatmapId) ?? heatmapDatasets[0],
    [selectedHeatmapId],
  )

  const totalEvents = useMemo(
    () => selectedHeatmap.values.flat().reduce((sum, value) => sum + value, 0),
    [selectedHeatmap.values],
  )

  const peakHour = useMemo(() => {
    const hourTotals = Array.from({ length: 24 }, (_, hour) => {
      const total = selectedHeatmap.values.reduce((sum, row) => sum + (row[hour] ?? 0), 0)
      return { hour, total }
    })
    const highest = hourTotals.sort((a, b) => b.total - a.total)[0]
    return `${`${highest?.hour ?? 0}`.padStart(2, '0')}:00`
  }, [selectedHeatmap.values])

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formData.email || !formData.password) {
      setLoginError('Email and password are required.')
      return
    }

    setLoginError(null)
    setIsSubmitting(true)

    try {
      if (authMode === 'create-user') {
        const registrationSession = await registerWithApi(formData.email, formData.password)
        if (registrationSession?.token) {
          saveSession(registrationSession)
          setIsLoggedIn(true)
        } else {
          setAuthMode('sign-in')
          setLoginError('User created successfully. Please sign in.')
        }
      } else {
        const session = await loginWithApi(formData.email, formData.password)
        saveSession(session)
        setIsLoggedIn(true)
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unexpected login error.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {isLoggedIn ? (
        <DashboardPage
          schedule={schedule}
          setSchedule={setSchedule}
          selectedHeatmapId={selectedHeatmapId}
          onHeatmapChange={setSelectedHeatmapId}
          heatmapDatasets={heatmapDatasets}
          routeStatus={routeStatus}
          totalEvents={totalEvents}
          peakHour={peakHour}
          onStart={() => setRouteStatus('active')}
          onEnd={() => setRouteStatus('ended')}
          onLogout={() => {
            clearSession()
            setIsLoggedIn(false)
            setRouteStatus('idle')
          }}
        />
      ) : (
        <LoginPage
          authMode={authMode}
          setAuthMode={setAuthMode}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleAuthSubmit}
          isSubmitting={isSubmitting}
          errorMessage={loginError}
        />
      )}
    </>
  )
}

export default App
