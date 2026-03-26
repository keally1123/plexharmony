import { useQuery } from '@tanstack/react-query'
import { Music, Disc, ListMusic, Wifi, WifiOff } from 'lucide-react'
import api from '../utils/api'

export default function DashboardPage() {
  const { data: status, isError: plexError } = useQuery({
    queryKey: ['plex-status'],
    queryFn: () => api.get('/plex/status').then(r => r.data),
    retry: 1,
  })

  const { data: genres } = useQuery({
    queryKey: ['genres'],
    queryFn: () => api.get('/plex/genres').then(r => r.data),
  })

  const { data: artists } = useQuery({
    queryKey: ['artists-count'],
    queryFn: () => api.get('/plex/artists?limit=1').then(r => r.data),
  })

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api.get('/plex/playlists').then(r => r.data),
  })

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-ph-text mb-2">Dashboard</h1>
      <p className="text-ph-muted mb-8">Your music library at a glance</p>

      {/* Plex status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-xl mb-8 border ${plexError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
        {plexError ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
        <div>
          <p className="font-medium text-sm">
            {plexError ? 'Cannot connect to Plex' : `Connected to ${status?.server_name || 'Plex'}`}
          </p>
          {!plexError && status && (
            <p className="text-xs opacity-70">Plex v{status.version}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard icon={Music} label="Artists" value={artists?.total ?? '—'} />
        <StatCard icon={Disc} label="Genres" value={genres?.genres?.length ?? '—'} />
        <StatCard icon={ListMusic} label="Playlists" value={playlists?.playlists?.length ?? '—'} />
      </div>

      {/* Quick genre list */}
      {genres?.genres && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
          <h2 className="font-display font-semibold text-ph-text mb-4">Genres in Library</h2>
          <div className="flex flex-wrap gap-2">
            {genres.genres.map((g: string) => (
              <span key={g} className="px-3 py-1 bg-ph-accent/10 text-ph-accent border border-ph-accent/20 rounded-full text-sm">
                {g}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-ph-accent/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-ph-accent" />
        </div>
        <span className="text-ph-muted text-sm">{label}</span>
      </div>
      <p className="text-3xl font-display font-bold text-ph-text">{value}</p>
    </div>
  )
}
