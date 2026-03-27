import type { AuthSession } from '../types/dashboard'

const SESSION_KEY = 'stm-auth-session'
const LOCAL_USERS_KEY = 'stm-local-users'

type LoginResponse = {
  token: string
}

type RegisterResponse = {
  token?: string
}

type LocalUser = {
  email: string
  password: string
}

function resolveApiBaseUrl() {
  const rawBaseUrl = import.meta.env.VITE_AUTH_API_BASE_URL
  if (!rawBaseUrl) {
    return ''
  }
  return rawBaseUrl.trim().replace(/\/$/, '')
}

function loadLocalUsers(): LocalUser[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as LocalUser[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalUsers(users: LocalUser[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
}

function createLocalSession(email: string): AuthSession {
  const token = `local-${email.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`
  return { token, email }
}

function loginWithLocalAuth(email: string, password: string): AuthSession {
  const users = loadLocalUsers()
  const matchedUser = users.find(
    (user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password,
  )

  if (!matchedUser) {
    throw new Error('Invalid credentials. Create a user first or check your password.')
  }

  return createLocalSession(email)
}

function registerWithLocalAuth(email: string, password: string): AuthSession {
  const users = loadLocalUsers()
  const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase())

  if (exists) {
    throw new Error('User already exists.')
  }

  users.push({ email, password })
  saveLocalUsers(users)
  return createLocalSession(email)
}

export async function loginWithApi(email: string, password: string): Promise<AuthSession> {
  const baseUrl = resolveApiBaseUrl()

  if (!baseUrl) {
    return loginWithLocalAuth(email, password)
  }
  try {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const message = response.status === 401 ? 'Invalid credentials.' : 'Login failed.'
      throw new Error(message)
    }

    const payload = (await response.json()) as LoginResponse
    if (!payload?.token) {
      throw new Error('Login response missing token.')
    }

    return {
      token: payload.token,
      email,
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return loginWithLocalAuth(email, password)
    }
    throw error
  }
}

export async function registerWithApi(email: string, password: string): Promise<AuthSession | null> {
  const baseUrl = resolveApiBaseUrl()

  if (!baseUrl) {
    return registerWithLocalAuth(email, password)
  }

  try {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const message =
        response.status === 409
          ? 'User already exists.'
          : 'Could not create user.'
      throw new Error(message)
    }

    const payload = (await response.json()) as RegisterResponse
    if (!payload?.token) {
      return null
    }

    return {
      token: payload.token,
      email,
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return registerWithLocalAuth(email, password)
    }
    throw error
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.email) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
