import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import api from '../utils/api'

interface AuthContextType {
  isAuthenticated: boolean
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem('ph_token') // sessionStorage clears on tab close
  )

  const login = useCallback(async (username: string, password: string) => {
    const resp = await api.post('/auth/login', { username, password })
    const t = resp.data.access_token
    sessionStorage.setItem('ph_token', t)
    setToken(t)
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem('ph_token')
    setToken(null)
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
