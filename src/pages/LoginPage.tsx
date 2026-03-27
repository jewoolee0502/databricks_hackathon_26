import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { AuthMode, LoginFormData } from '../types/dashboard'

type LoginPageProps = {
  authMode: AuthMode
  setAuthMode: Dispatch<SetStateAction<AuthMode>>
  formData: LoginFormData
  setFormData: Dispatch<SetStateAction<LoginFormData>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  errorMessage: string | null
}

export default function LoginPage({
  authMode,
  setAuthMode,
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
  errorMessage,
}: LoginPageProps) {
  const isSignIn = authMode === 'sign-in'

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <img className="stm-logo" src="/stm-logo.svg" alt="STM" />
        <p className="eyebrow">STM Frequency Monitoring Agent</p>
        <h1>{isSignIn ? 'Sign In' : 'Create User'}</h1>
        <p className="auth-copy">
          {isSignIn
            ? 'Access the dashboard to monitor STM bus frequency with route and stop heatmaps.'
            : 'Create an operator account to start using the STM dashboard.'}
        </p>

        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={isSignIn}
            className={`auth-mode-btn ${isSignIn ? 'active' : ''}`}
            onClick={() => setAuthMode('sign-in')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignIn}
            className={`auth-mode-btn ${!isSignIn ? 'active' : ''}`}
            onClick={() => setAuthMode('create-user')}
          >
            Create User
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              placeholder="ops@stm.local"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="********"
              value={formData.password}
              onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            className="btn primary full"
            disabled={isSubmitting || !formData.email || !formData.password}
          >
            {isSubmitting
              ? isSignIn
                ? 'Authenticating...'
                : 'Creating Account...'
              : isSignIn
                ? 'Sign In'
                : 'Create User'}
          </button>
          {errorMessage && <p className="auth-error">{errorMessage}</p>}
        </form>
      </section>
    </main>
  )
}
