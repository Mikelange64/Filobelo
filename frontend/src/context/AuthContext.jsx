import { createContext, useContext, useState, useEffect } from 'react'
import {
  authFetch,
  loginRequest,
  registerRequest,
  logoutRequest,
  getTokens,
  clearTokens,
} from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // true while we're checking stored tokens on first load — prevents a flash to /login
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { access } = getTokens()
    if (!access) {
      setLoading(false)
      return
    }
    authFetch('/users/me')
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setLoading(false))
  }, [])

  async function login(emailOrUsername, password) {
    await loginRequest(emailOrUsername, password)
    const me = await authFetch('/users/me')
    setUser(me)
  }

  async function register(username, email, password) {
    await registerRequest(username, email, password)
    // auto-login after successful registration
    await login(username, password)
  }

  async function logout() {
    const { refresh } = getTokens()
    try {
      if (refresh) await logoutRequest(refresh)
    } catch {
      // server-side cleanup is best-effort; clear locally regardless
    }
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
