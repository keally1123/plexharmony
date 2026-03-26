import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ListMusic, Trash2, Music2, Check, X, ChevronDown, Clock, Shuffle } from 'lucide-react'
import api from '../utils/api'

type PlaylistMode = 'genre' | 'similar_artist' | 'mixed'

function Toggle({ label, icon, value, onChange }: { label: string; icon?: React.ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={() => onChange(!value)}
        className={`w-9 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-ph-accent' : 'bg-ph-border'}`}>
        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <span className="text-sm text-ph-text flex items-center gap-1.5">{icon}{label}</span>
    </div>
  )
}

function formatDuration(ms: number) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function PlaylistsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '', mode: 'genre' as PlaylistMode, genre: '', seed_artist_name: '',
    max_tracks: 50, min_duration_minutes: '' as string | number,
    max_duration_minutes: '' as string | number, shuffle: false, push_to_plex: true,
  })
  const [preview, setPreview] = useState<any>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const { data: playlists, isLoading } = useQuery({ queryKey: ['plex-playlists'], queryFn: () => api.get('/plex/playlists').then(r => r.data) })
  const { data: genres } = useQuery({ queryKey: ['genres'], queryFn: () => api.get('/plex/genres').then(r => r.data) })

  const generateMutation = useMutation({
    mutationFn: (data: any) => api.post('/playlists/generate', data).then(r => r.data),
    onSuccess: (data) => {
      setPreview(data)
      if (data.plex_playlist_id) {
        setSuccessMsg(`✓ "${data.name}" created in Plex — ${data.track_count} tracks · ${data.total_minutes}m`)
        qc.invalidateQueries({ queryKey: ['plex-playlists'] })
        setTimeout(() => setSuccessMsg(''), 6000)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/playlists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plex-playlists'] }),
  })

  const handleGenerate = () => {
    const payload: any = { name: formData.name, mode: formData.mode, max_tracks: formData.max_tracks, shuffle: formData.shuffle, push_to_plex: formData.push_to_plex }
    if (formData.min_duration_minutes !== '') payload.min_duration_minutes = Number(formData.min_duration_minutes)
    if (formData.max_duration_minutes !== '') payload.max_duration_minutes = Number(formData.max_duration_minutes)
    if (formData.mode === 'genre' || formData.mode === 'mixed') payload.genre = formData.genre
    if (formData.mode === 'similar_artist' || formData.mode === 'mixed') payload.seed_artist_name = formData.seed_artist_name
    generateMutation.mutate(payload)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-ph-text">Playlists</h1>
          <p className="text-ph-muted text-sm mt-0.5">Generate and push playlists to Plex</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setPreview(null) }} className="flex items-center gap-2 px-4 py-2 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Playlist
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl mb-6 text-green-400 text-sm">
          <Check className="w-4 h-4 shrink-0" />{successMsg}
        </div>
      )}

      {showForm && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-6 mb-8">
          <h2 className="font-display font-semibold text-ph-text mb-5">Create Playlist</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-ph-muted mb-1.5">Playlist Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="My Awesome Playlist" className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-ph-muted mb-1.5">Mode</label>
              <div className="relative">
                <select value={formData.mode} onChange={e => setFormData(p => ({ ...p, mode: e.target.value as PlaylistMode }))} className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text appearance-none focus:outline-none focus:border-ph-accent">
                  <option value="genre">By Genre</option>
                  <option value="similar_artist">Similar Artists</option>
                  <option value="mixed">Genre + Similar</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted pointer-events-none" />
              </div>
            </div>
            {(formData.mode === 'genre' || formData.mode === 'mixed') && (
              <div>
                <label className="block text-sm text-ph-muted mb-1.5">Genre</label>
                <div className="relative">
                  <select value={formData.genre} onChange={e => setFormData(p => ({ ...p, genre: e.target.value }))} className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text appearance-none focus:outline-none focus:border-ph-accent">
                    <option value="">— Select genre —</option>
                    {genres?.genres?.map((g: string) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted pointer-events-none" />
                </div>
              </div>
            )}
            {(formData.mode === 'similar_artist' || formData.mode === 'mixed') && (
              <div>
                <label className="block text-sm text-ph-muted mb-1.5">Seed Artist</label>
                <input type="text" value={formData.seed_artist_name} onChange={e => setFormData(p => ({ ...p, seed_artist_name: e.target.value }))} placeholder="e.g. Radiohead" className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors" />
              </div>
            )}
            <div>
              <label className="block text-sm text-ph-muted mb-1.5">Max Tracks: {formData.max_tracks}</label>
              <input type="range" min={5} max={500} step={5} value={formData.max_tracks} onChange={e => setFormData(p => ({ ...p, max_tracks: +e.target.value }))} className="w-full accent-ph-accent mt-2" />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-ph-muted" />
                <span className="text-sm text-ph-muted font-medium">Duration Limits <span className="text-xs opacity-60">(optional)</span></span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ph-muted mb-1.5">Min Duration (minutes)</label>
                  <input type="number" min={1} max={600} value={formData.min_duration_minutes} onChange={e => setFormData(p => ({ ...p, min_duration_minutes: e.target.value }))} placeholder="e.g. 30" className="w-full px-3 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-ph-muted mb-1.5">Max Duration (minutes)</label>
                  <input type="number" min={1} max={600} value={formData.max_duration_minutes} onChange={e => setFormData(p => ({ ...p, max_duration_minutes: e.target.value }))} placeholder="e.g. 60" className="w-full px-3 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm" />
                </div>
              </div>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-6">
              <Toggle label="Shuffle tracks" icon={<Shuffle className="w-3.5 h-3.5" />} value={formData.shuffle} onChange={v => setFormData(p => ({ ...p, shuffle: v }))} />
              <Toggle label="Push to Plex" value={formData.push_to_plex} onChange={v => setFormData(p => ({ ...p, push_to_plex: v }))} />
            </div>
          </div>
          {generateMutation.isError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {(generateMutation.error as any)?.response?.data?.detail || 'Generation failed'}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={handleGenerate} disabled={generateMutation.isPending || !formData.name} className="px-5 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {generateMutation.isPending ? 'Generating…' : 'Generate'}
            </button>
            <button onClick={() => { setShowForm(false); setPreview(null) }} className="px-5 py-2.5 bg-ph-border text-ph-muted rounded-xl text-sm font-semibold transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-ph-card border border-ph-accent/20 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-ph-text">{preview.name}</h3>
              <p className="text-ph-muted text-sm">{preview.track_count} tracks · {preview.total_minutes}m</p>
            </div>
            <button onClick={() => setPreview(null)} className="text-ph-muted hover:text-ph-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {preview.tracks?.map((t: any, i: number) => (
              <div key={t.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-ph-border/50 last:border-0">
                <span className="w-5 text-ph-muted text-xs text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-ph-text truncate">{t.title}</p><p className="text-ph-muted text-xs truncate">{t.artist}</p></div>
                <span className="text-ph-muted text-xs shrink-0">{formatDuration(t.duration)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display font-semibold text-ph-text mb-4">Plex Playlists</h2>
        {isLoading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-ph-card border border-ph-border rounded-xl animate-pulse" />)}</div>
        : playlists?.playlists?.length === 0 ? (
          <div className="text-center py-12 text-ph-muted"><ListMusic className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No playlists yet.</p></div>
        ) : (
          <div className="space-y-3">
            {playlists?.playlists?.map((p: any) => (
              <div key={p.id} className="flex items-center gap-4 p-4 bg-ph-card border border-ph-border rounded-xl">
                {p.thumb ? <img src={p.thumb} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-ph-accent/10 flex items-center justify-center shrink-0"><Music2 className="w-5 h-5 text-ph-accent" /></div>}
                <div className="flex-1 min-w-0"><p className="font-medium text-ph-text truncate">{p.title}</p><p className="text-ph-muted text-xs">{p.trackCount} tracks · {formatDuration(p.duration)}</p></div>
                <button onClick={() => deleteMutation.mutate(p.id)} disabled={deleteMutation.isPending} className="p-2 text-ph-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
