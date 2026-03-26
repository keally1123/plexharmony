import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Music, Lock, User } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Login failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ph-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ph-accent/10 border border-ph-accent/20 mb-4">
            <Music className="w-8 h-8 text-ph-accent" />
          </div>
          <h1 className="text-3xl font-display font-bold text-ph-text">PlexHarmony</h1>
          <p className="text-ph-muted mt-1">Smart playlist manager</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="bg-ph-card border border-ph-border rounded-2xl p-8 shadow-xl">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ph-text mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors"
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ph-text mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="text-center text-ph-muted text-xs mt-6">
          Local access only — credentials stored in .env
        </p>
      </div>
    </div>
  )
}
