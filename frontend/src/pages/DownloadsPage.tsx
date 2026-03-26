import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Search, Plus, CheckCircle, AlertCircle, Pause, Play, Trash2 } from 'lucide-react'
import api from '../utils/api'

type DlTab = 'lidarr' | 'downloading'

export default function DownloadsPage() {
  const [tab, setTab] = useState<DlTab>('lidarr')
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-ph-text">Downloads</h1>
        <p className="text-ph-muted text-sm mt-0.5">Manage your acquisition pipeline</p>
      </div>
      <div className="flex gap-1 p-1 bg-ph-card border border-ph-border rounded-xl mb-6 w-fit">
        {([['lidarr','Lidarr'],['downloading','Downloading']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-ph-accent text-white' : 'text-ph-muted hover:text-ph-text'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'lidarr'      && <LidarrPanel />}
      {tab === 'downloading' && <DownloadingPanel />}
    </div>
  )
}

// ── LIDARR ────────────────────────────────────────────────────────────────────
function LidarrPanel() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [lookupResults, setLookupResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [msg, setMsg] = useState('')

  const { data: status } = useQuery({
    queryKey: ['lidarr-status'],
    queryFn: () => api.get('/lidarr/status').then(r => r.data).catch(() => ({ configured: false })),
    retry: 0,
  })
  const { data: wanted } = useQuery({
    queryKey: ['lidarr-wanted'],
    queryFn: () => api.get('/lidarr/wanted').then(r => r.data),
    enabled: !!status?.connected,
  })
  const { data: queue } = useQuery({
    queryKey: ['lidarr-queue'],
    queryFn: () => api.get('/lidarr/queue').then(r => r.data),
    enabled: !!status?.connected,
    refetchInterval: 10000,
  })

  const addMutation = useMutation({
    mutationFn: (artist: any) => api.post('/lidarr/artists/add', { name: artist.name, mbid: artist.mbid }).then(r => r.data),
    onSuccess: (data) => {
      setMsg(`✓ "${data.artist}" added to Lidarr`)
      setLookupResults([])
      setSearch('')
      setTimeout(() => setMsg(''), 4000)
    },
    onError: (e: any) => setMsg(`✗ ${e?.response?.data?.detail || 'Failed to add'}`)
  })

  const doLookup = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const r = await api.get('/lidarr/lookup', { params: { term: search } })
      setLookupResults(r.data.results || [])
    } catch { setLookupResults([]) }
    setSearching(false)
  }

  if (!status?.configured) return <NotConfigured tool="Lidarr" />

  return (
    <div className="space-y-4">
      <ConnBadge connected={!!status?.connected} label={status?.connected ? `Lidarr v${status.version}` : 'Cannot connect to Lidarr'} />
      {msg && (
        <div className={`p-3 rounded-xl text-sm border ${msg.startsWith('✓') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>{msg}</div>
      )}

      <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
        <h3 className="font-display font-semibold text-ph-text mb-3">Add Artist to Monitor</h3>
        <div className="flex gap-3 mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doLookup()}
            placeholder="Search artist name…"
            className="flex-1 px-3 py-2.5 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm transition-colors" />
          <button onClick={doLookup} disabled={searching || !search.trim()}
            className="px-4 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shrink-0">
            {searching ? '…' : <Search className="w-4 h-4" />}
          </button>
        </div>
        {lookupResults.length > 0 && (
          <div className="space-y-2">
            {lookupResults.map((r: any) => (
              <div key={r.mbid} className="flex items-center gap-3 p-3 bg-ph-bg rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-ph-text text-sm font-medium">{r.name}</p>
                  <p className="text-ph-muted text-xs">{r.genres?.join(', ') || 'No genres listed'}</p>
                  {r.overview && <p className="text-ph-muted text-xs mt-0.5 line-clamp-1">{r.overview}</p>}
                </div>
                <button onClick={() => addMutation.mutate(r)} disabled={addMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ph-accent/10 text-ph-accent border border-ph-accent/20 rounded-lg text-xs font-medium shrink-0 hover:bg-ph-accent/20 transition-colors">
                  <Plus className="w-3 h-3" /> Monitor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(wanted?.albums?.length ?? 0) > 0 && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
          <h3 className="font-display font-semibold text-ph-text mb-3">Missing Albums ({wanted.total})</h3>
          <div className="space-y-2">
            {wanted.albums.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-ph-bg rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-ph-text text-sm font-medium truncate">{a.title}</p>
                  <p className="text-ph-muted text-xs">{a.artist} · {a.releaseDate?.split('T')[0] ?? '?'}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0">Missing</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(queue?.items?.length ?? 0) > 0 && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
          <h3 className="font-display font-semibold text-ph-text mb-3">Lidarr Queue ({queue.total})</h3>
          <div className="space-y-3">
            {queue.items.map((item: any) => (
              <ProgressRow key={item.id} name={item.title} sub={item.artist} client="Lidarr" status={item.status} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── UNIFIED DOWNLOADING TAB ───────────────────────────────────────────────────
function DownloadingPanel() {
  const qc = useQueryClient()

  const { data: qbitData }   = useQuery({ queryKey: ['qbit-all'],   queryFn: () => api.get('/qbittorrent/torrents', { params: { filter: 'all' } }).then(r => r.data).catch(() => null), refetchInterval: 5000 })
  const { data: delugeData } = useQuery({ queryKey: ['deluge-all'], queryFn: () => api.get('/deluge/torrents').then(r => r.data).catch(() => null), refetchInterval: 5000 })
  const { data: sabData }    = useQuery({ queryKey: ['sab-queue'],  queryFn: () => api.get('/sabnzbd/queue').then(r => r.data).catch(() => null), refetchInterval: 5000 })

  const qbitItems  = (qbitData?.torrents   ?? []).map((t: any) => ({ ...t, _client: 'qBittorrent', _type: 'torrent' }))
  const delugeItems= (delugeData?.torrents ?? []).map((t: any) => ({ ...t, _client: 'Deluge',      _type: 'torrent' }))
  const sabItems   = (sabData?.items       ?? []).map((t: any) => ({ ...t, _client: 'SABnzbd',     _type: 'nzb',    progress: parseFloat(t.percentage ?? 0), name: t.filename ?? t.name }))

  const allItems = [...qbitItems, ...delugeItems, ...sabItems]
  const active   = allItems.filter(i => !['seeding','Seeding','Completed','completedDownload'].includes(i.state ?? i.status ?? ''))
  const done     = allItems.filter(i =>  ['seeding','Seeding','Completed','completedDownload'].includes(i.state ?? i.status ?? ''))

  const pauseQbit  = useMutation({ mutationFn: (hash: string) => api.post(`/qbittorrent/pause/${hash}`),  onSuccess: () => qc.invalidateQueries({ queryKey: ['qbit-all'] }) })
  const resumeQbit = useMutation({ mutationFn: (hash: string) => api.post(`/qbittorrent/resume/${hash}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['qbit-all'] }) })
  const deleteQbit = useMutation({ mutationFn: (hash: string) => api.delete(`/qbittorrent/${hash}`),      onSuccess: () => qc.invalidateQueries({ queryKey: ['qbit-all'] }) })

  const noClients = !qbitData && !delugeData && !sabData

  if (noClients) return (
    <div className="bg-ph-card border border-ph-border rounded-2xl p-10 text-center">
      <Download className="w-10 h-10 text-ph-muted mx-auto mb-3 opacity-30" />
      <h3 className="font-display font-semibold text-ph-text mb-2">No download clients connected</h3>
      <p className="text-ph-muted text-sm">Add clients in <span className="text-ph-text font-semibold">Settings → Downloads</span></p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Client status strip */}
      <div className="flex flex-wrap gap-2">
        {qbitData   && <StatusPill label={`qBittorrent`} connected={true} count={qbitItems.length} />}
        {delugeData && <StatusPill label={`Deluge`}      connected={true} count={delugeItems.length} />}
        {sabData    && <StatusPill label={`SABnzbd`}     connected={true} count={sabItems.length} />}
      </div>

      {/* Active downloads */}
      <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
        <h3 className="font-display font-semibold text-ph-text mb-4">
          Active ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-ph-muted text-sm text-center py-6">No active downloads</p>
        ) : (
          <div className="space-y-3">
            {active.map((item: any, i: number) => {
              const pct = Math.round(item.progress ?? 0)
              const isPaused = ['pausedDL','pausedUP','Paused'].includes(item.state ?? '')
              return (
                <div key={i} className="bg-ph-bg rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-ph-text text-sm font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ph-border text-ph-muted">{item._client}</span>
                        {item._type === 'torrent' && <span className="text-xs text-ph-muted">{item.state}</span>}
                        {item.dlspeed > 0 && <span className="text-xs text-ph-muted">{(item.dlspeed / 1024).toFixed(0)} KB/s</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {item._client === 'qBittorrent' && (
                        <>
                          {isPaused
                            ? <button onClick={() => resumeQbit.mutate(item.hash)} className="p-1.5 text-ph-muted hover:text-ph-accent rounded-lg transition-colors"><Play className="w-3.5 h-3.5" /></button>
                            : <button onClick={() => pauseQbit.mutate(item.hash)}  className="p-1.5 text-ph-muted hover:text-ph-accent rounded-lg transition-colors"><Pause className="w-3.5 h-3.5" /></button>
                          }
                          <button onClick={() => deleteQbit.mutate(item.hash)} className="p-1.5 text-ph-muted hover:text-red-400 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-ph-border rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: pct === 100 ? '#4ade80' : '#6d83f2' }}
                      />
                    </div>
                    <span className="text-xs font-mono text-ph-muted shrink-0 w-8 text-right">{pct}%</span>
                  </div>
                  {item.eta > 0 && item.eta < 8640000 && (
                    <p className="text-xs text-ph-muted mt-1">ETA: {formatEta(item.eta)}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Completed */}
      {done.length > 0 && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
          <h3 className="font-display font-semibold text-ph-text mb-3">Completed ({done.length})</h3>
          <div className="space-y-2">
            {done.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-ph-bg rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-ph-text text-sm truncate">{item.name}</p>
                  <p className="text-ph-muted text-xs">{item._client}</p>
                </div>
                <div className="flex-1 max-w-xs bg-ph-border rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-green-500" style={{ width: '100%' }} />
                </div>
                <span className="text-xs font-mono text-green-400 shrink-0">100%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function ProgressRow({ name, sub, client, status, progress }: { name: string; sub?: string; client: string; status?: string; progress?: number }) {
  const pct = Math.round(progress ?? 0)
  return (
    <div className="bg-ph-bg rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-ph-text text-sm font-medium truncate">{name}</p>
          {sub && <p className="text-ph-muted text-xs">{sub}</p>}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-ph-border text-ph-muted shrink-0">{client}</span>
        {status && <span className="text-xs text-ph-muted shrink-0">{status}</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-ph-border rounded-full h-2.5 overflow-hidden">
          <div className="h-2.5 rounded-full bg-ph-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono text-ph-muted shrink-0 w-8 text-right">{pct}%</span>
      </div>
    </div>
  )
}

function ConnBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm ${connected ? 'bg-green-500/8 border-green-500/20 text-green-400' : 'bg-red-500/8 border-red-500/20 text-red-400'}`}>
      {connected ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {label}
    </div>
  )
}

function StatusPill({ label, connected, count }: { label: string; connected: boolean; count: number }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs ${connected ? 'border-green-500/20 text-green-400 bg-green-500/8' : 'border-ph-border text-ph-muted bg-ph-card'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-ph-muted'}`} />
      {label} · {count}
    </div>
  )
}

function NotConfigured({ tool }: { tool: string }) {
  return (
    <div className="bg-ph-card border border-ph-border rounded-2xl p-10 text-center">
      <AlertCircle className="w-10 h-10 text-ph-muted mx-auto mb-3 opacity-30" />
      <h3 className="font-display font-semibold text-ph-text mb-2">{tool} not configured</h3>
      <p className="text-ph-muted text-sm">Configure {tool} in <span className="text-ph-text font-semibold">Settings → Downloads</span></p>
    </div>
  )
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
