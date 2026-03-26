import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Sparkles, Search, ExternalLink, Music2, Users, Radio, Plus, Check } from 'lucide-react'
import api from '../utils/api'

type DiscoveryMode = 'similar-artists' | 'similar-tracks' | 'genre-artists'

const TABS: { id: DiscoveryMode; label: string; icon: any }[] = [
  { id: 'similar-artists', label: 'Similar Artists', icon: Users },
  { id: 'similar-tracks',  label: 'Similar Tracks',  icon: Music2 },
  { id: 'genre-artists',   label: 'By Genre',         icon: Radio },
]

export default function DiscoveryPage() {
  const [mode, setMode] = useState<DiscoveryMode>('similar-artists')
  const [artistInput, setArtistInput] = useState('')
  const [trackInput, setTrackInput] = useState('')
  const [genreInput, setGenreInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [queryParams, setQueryParams] = useState<any>(null)

  const { data: genres } = useQuery({
    queryKey: ['genres'],
    queryFn: () => api.get('/plex/genres').then(r => r.data),
  })

  const { data: results, isLoading, error } = useQuery({
    queryKey: ['discovery', mode, queryParams],
    queryFn: () => {
      if (!queryParams) return null
      if (mode === 'similar-artists') {
        return api.get('/discovery/similar-artists', { params: { artist: queryParams.artist, limit: 15 } }).then(r => r.data)
      } else if (mode === 'similar-tracks') {
        return api.get('/discovery/similar-tracks', { params: { artist: queryParams.artist, track: queryParams.track, limit: 15 } }).then(r => r.data)
      } else {
        return api.get('/discovery/genre-artists', { params: { genre: queryParams.genre, limit: 20 } }).then(r => r.data)
      }
    },
    enabled: !!queryParams,
  })

  const handleSearch = () => {
    if (mode === 'similar-artists' && artistInput) setQueryParams({ artist: artistInput })
    else if (mode === 'similar-tracks' && artistInput && trackInput) setQueryParams({ artist: artistInput, track: trackInput })
    else if (mode === 'genre-artists' && genreInput) setQueryParams({ genre: genreInput })
    setSubmitted(true)
  }

  const apiError = (error as any)?.response?.data?.detail

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-ph-text">Discover</h1>
        <p className="text-ph-muted text-sm mt-0.5">Find new music — powered by Last.fm</p>
      </div>

      <div className="flex gap-1 p-1 bg-ph-card border border-ph-border rounded-xl mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setMode(id); setQueryParams(null); setSubmitted(false) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === id ? 'bg-ph-accent text-white' : 'text-ph-muted hover:text-ph-text'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="bg-ph-card border border-ph-border rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {(mode === 'similar-artists' || mode === 'similar-tracks') && (
            <div className="flex-1 min-w-40">
              <label className="block text-sm text-ph-muted mb-1.5">Artist Name</label>
              <input type="text" value={artistInput} onChange={e => setArtistInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Radiohead"
                className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors" />
            </div>
          )}
          {mode === 'similar-tracks' && (
            <div className="flex-1 min-w-40">
              <label className="block text-sm text-ph-muted mb-1.5">Track Title</label>
              <input type="text" value={trackInput} onChange={e => setTrackInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Creep"
                className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors" />
            </div>
          )}
          {mode === 'genre-artists' && (
            <div className="flex-1 min-w-40">
              <label className="block text-sm text-ph-muted mb-1.5">Genre</label>
              <input type="text" list="genre-list" value={genreInput} onChange={e => setGenreInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. indie rock"
                className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors" />
              <datalist id="genre-list">
                {genres?.genres?.map((g: string) => <option key={g} value={g} />)}
              </datalist>
            </div>
          )}
          <button onClick={handleSearch}
            className="flex items-center gap-2 px-5 py-2.5 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold transition-colors shrink-0">
            <Search className="w-4 h-4" />Search
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-28 bg-ph-card border border-ph-border rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {apiError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {apiError.includes('LASTFM_API_KEY')
            ? '🔑 Last.fm API key not configured. Add LASTFM_API_KEY to your .env file. Get a free key at last.fm/api'
            : apiError}
        </div>
      )}

      {results && !isLoading && (
        <>
          {mode === 'similar-artists' && results.suggestions && (
            <ArtistGrid artists={results.suggestions} seedArtist={results.seed_artist} />
          )}
          {mode === 'similar-tracks' && results.suggestions && (
            <TrackList tracks={results.suggestions} seed={results.seed} />
          )}
          {mode === 'genre-artists' && results.artists && (
            <ArtistGrid artists={results.artists} seedArtist={results.genre} label={`Top artists for "${results.genre}"`} />
          )}
        </>
      )}

      {submitted && !isLoading && !results && !error && (
        <div className="text-center py-12 text-ph-muted">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No results found.</p>
        </div>
      )}
    </div>
  )
}

function AddToLidarrButton({ artistName, mbid }: { artistName: string; mbid?: string }) {
  const [added, setAdded] = useState(false)
  const { data: lidarrStatus } = useQuery({
    queryKey: ['lidarr-status'],
    queryFn: () => api.get('/lidarr/status').then(r => r.data).catch(() => ({ configured: false })),
    retry: 0,
  })
  const addMutation = useMutation({
    mutationFn: () => api.post('/lidarr/artists/add', { name: artistName, mbid }).then(r => r.data),
    onSuccess: () => setAdded(true),
  })
  if (!lidarrStatus?.connected) return null
  return (
    <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || added}
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${added ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-ph-border text-ph-muted hover:text-ph-accent hover:border-ph-accent/30 border-ph-border'}`}>
      {added ? <><Check className="w-3 h-3" />Added</> : addMutation.isPending ? '…' : <><Plus className="w-3 h-3" />Lidarr</>}
    </button>
  )
}

function ArtistGrid({ artists, seedArtist, label }: { artists: any[]; seedArtist: string; label?: string }) {
  return (
    <div>
      <p className="text-ph-muted text-sm mb-4">
        {label || `Artists similar to "${seedArtist}"`} — <span className="text-ph-accent">{artists.filter(a => !a.in_library).length} new discoveries</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {artists.map((a: any) => (
          <div key={a.name} className={`p-4 rounded-xl border ${a.in_library ? 'bg-ph-card border-ph-border opacity-60' : 'bg-ph-card border-ph-accent/20'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                {a.image ? (
                  <img src={a.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-ph-accent/10 flex items-center justify-center shrink-0">
                    <Music2 className="w-5 h-5 text-ph-accent" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-ph-text text-sm">{a.name}</p>
                  {a.match_score != null && <p className="text-xs text-ph-muted">{Math.round(a.match_score * 100)}% match</p>}
                </div>
              </div>
              {a.url && (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-ph-muted hover:text-ph-accent shrink-0 mt-0.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {a.in_library ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">In Library</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-ph-accent/10 text-ph-accent border border-ph-accent/20">New Discovery</span>
              )}
              {!a.in_library && <AddToLidarrButton artistName={a.name} mbid={a.mbid} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrackList({ tracks, seed }: { tracks: any[]; seed: any }) {
  return (
    <div>
      <p className="text-ph-muted text-sm mb-4">Tracks similar to "{seed?.track}" by {seed?.artist}</p>
      <div className="space-y-3">
        {tracks.map((t: any, i: number) => (
          <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border ${t.in_library ? 'bg-ph-card border-ph-border opacity-60' : 'bg-ph-card border-ph-accent/20'}`}>
            <span className="text-ph-muted text-sm w-5 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ph-text text-sm truncate">{t.title}</p>
              <p className="text-ph-muted text-xs truncate">{t.artist}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.in_library ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">In Library</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-ph-accent/10 text-ph-accent border border-ph-accent/20">New</span>
              )}
              {t.url && (
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-ph-muted hover:text-ph-accent">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
