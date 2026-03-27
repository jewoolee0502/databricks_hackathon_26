import { useState, useEffect, useCallback } from 'react'
import type { HeatmapDataset } from '../types/dashboard'

const API_BASE = 'http://localhost:3001/api'

export type SummaryData = {
  totalEvents: number
  totalRoutes: number
  totalStops: number
  peakHour: string
  busiestStops: { stop_name: string; stop_id: string; trip_count: number }[]
}

export type RouteOption = {
  route_id: string
  route_long_name: string
  label: string
  trip_count: number
}

type StmDataState = {
  heatmapDatasets: HeatmapDataset[]
  summary: SummaryData | null
  routes: RouteOption[]
  loading: boolean
  error: string | null
}

export function useStmData() {
  const [state, setState] = useState<StmDataState>({
    heatmapDatasets: [],
    summary: null,
    routes: [],
    loading: true,
    error: null,
  })

  const fetchAll = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const [routeHourRes, stopHourRes, summaryRes, routesRes] = await Promise.all([
        fetch(`${API_BASE}/route-hour-matrix`),
        fetch(`${API_BASE}/stop-hour-matrix`),
        fetch(`${API_BASE}/summary`),
        fetch(`${API_BASE}/routes`),
      ])

      if (!routeHourRes.ok || !stopHourRes.ok || !summaryRes.ok || !routesRes.ok) {
        throw new Error('One or more API requests failed. Is the proxy server running on port 3001?')
      }

      const [routeHour, stopHour, summary, routes] = await Promise.all([
        routeHourRes.json() as Promise<HeatmapDataset>,
        stopHourRes.json() as Promise<HeatmapDataset>,
        summaryRes.json() as Promise<SummaryData>,
        routesRes.json() as Promise<RouteOption[]>,
      ])

      setState({
        heatmapDatasets: [routeHour, stopHour],
        summary,
        routes,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }))
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { ...state, refresh: fetchAll }
}
