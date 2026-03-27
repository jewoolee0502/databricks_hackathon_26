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
import { useStmData } from './hooks/useStmData'
import type {
  AuthMode,
  HeatmapDataset,
  LoginFormData,
  RouteStatus,
  Schedule,
} from './types/dashboard'

function toInputDateTime(date: Date) {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

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

  // Fetch real data from Databricks via proxy
  const { heatmapDatasets, summary, routes, loading: dataLoading, error: dataError } = useStmData()

  useEffect(() => {
    const existingSession = loadSession()
    if (existingSession?.token) {
      setIsLoggedIn(true)
      setFormData((prev) => ({ ...prev, email: existingSession.email }))
    }
  }, [])

  const totalEvents = summary?.totalEvents ?? 0
  const peakHour = summary?.peakHour ?? '--:--'

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
          routes={routes}
          summary={summary}
          dataLoading={dataLoading}
          dataError={dataError}
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
