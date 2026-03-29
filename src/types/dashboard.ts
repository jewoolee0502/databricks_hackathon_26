export type RouteStatus = 'idle' | 'active' | 'ended'

export type Route = {
  route_id: string
  route_short_name: string
  route_long_name: string
}

export type Direction = {
  id: string
  label: string
}

export type Stop = {
  stop_id: string
  stop_name: string
}

export type Schedule = {
  startDateTime: string
  endDateTime: string
}

export type LoginFormData = {
  email: string
  password: string
}

export type AuthMode = 'sign-in' | 'create-user'

export type HeatmapDataset = {
  id: 'route-hour' | 'stop-sequence-hour'
  title: string
  description: string
  xLabels: string[]
  yLabels: string[]
  values: number[][]
  valueLabel: string
}

export type AuthSession = {
  token: string
  email: string
}

export type SuggestionCategory = 'bottleneck' | 'connection-miss' | 'schedule-gap' | 'late-schedule'

export type Suggestion = {
  id: string
  category: SuggestionCategory
  action: string
  projectedOutcome: string
  rageScore: number
  hour: number
  ridersAffected: number
}

export type AvailableResource = {
  routeId: string
  routeName: string
  hour: number
  currentTrips: number
  avgTrips: number
  depot: string
  busesAvailable: number
}
