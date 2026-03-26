import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Music, Library, ListMusic, Sparkles, LogOut, Radio, Tag, Settings, Download, Bot } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const NAV = [
  { to: '/',          icon: Radio,     label: 'Dashboard',  end: true },
  { to: '/library',   icon: Library,   label: 'Library' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/ai',        icon: Bot,       label: 'AI Assistant' },
  { to: '/discovery', icon: Sparkles,  label: 'Discover' },
  { to: '/tagging',   icon: Tag,       label: 'Tag Tools' },
  { to: '/downloads', icon: Download,  label: 'Downloads' },
]

export default function Layout() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-ph-bg flex">
      <aside className="w-60 bg-ph-card border-r border-ph-border flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-ph-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ph-accent/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-ph-accent" />
            </div>
            <span className="font-display font-bold text-ph-text text-lg">PlexHarmony</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-ph-accent/10 text-ph-accent' : 'text-ph-muted hover:text-ph-text hover:bg-ph-border/50'}`
              }>
              <Icon className="w-4 h-4" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-ph-border space-y-1">
          <NavLink to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-ph-accent/10 text-ph-accent' : 'text-ph-muted hover:text-ph-text hover:bg-ph-border/50'}`
            }>
            <Settings className="w-4 h-4" />Settings
          </NavLink>
          <button onClick={() => { logout(); navigate('/login') }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-ph-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4" />Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
