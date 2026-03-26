import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Tag, Search, Database, Music2, ExternalLink, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react'
import api from '../utils/api'

type ToolTab = 'beets' | 'musicbrainz' | 'picard'

export default function TaggingPage() {
  const [tab, setTab] = useState<ToolTab>('beets')

  const TABS: { id: ToolTab; label: string; icon: any }[] = [
    { id: 'beets',        label: 'Beets',         icon: Tag },
    { id: 'musicbrainz',  label: 'MusicBrainz',   icon: Database },
    { id: 'picard',       label: 'Picard',         icon: Music2 },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-ph-text">Tagging Tools</h1>
        <p className="text-ph-muted text-sm mt-0.5">Fix and enrich your music metadata</p>
      </div>

      <div className="flex gap-1 p-1 bg-ph-card border border-ph-border rounded-xl mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-ph-accent text-white' : 'text-ph-muted hover:text-ph-text'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'beets'       && <BeetsPanel />}
      {tab === 'musicbrainz' && <MusicBrainzPanel />}
      {tab === 'picard'      && <PicardPanel />}
    </div>
  )
}

// ── BEETS ────────────────────────────────────────────────────────────────────

function BeetsPanel() {
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editTags, setEditTags] = useState<Record<string, string>>({})

  const { data: status } = useQuery({
    queryKey: ['beets-status'],
    queryFn: () => api.get('/beets/status').then(r => r.data).catch(() => ({ connected: false })),
    retry: 0,
  })

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ['beets-items', search],
    queryFn: () => api.get('/beets/items', { params: { search, limit: 50 } }).then(r => r.data),
    enabled: submitted,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, tags }: { id: number; tags: any }) =>
      api.patch(`/beets/items/${id}`, tags).then(r => r.data),
    onSuccess: () => { setEditingItem(null); refetch() },
  })

  const startEdit = (item: any) => {
    setEditingItem(item)
    setEditTags({ title: item.title || '', artist: item.artist || '', album: item.album || '', genre: item.genre || '', year: item.year || '' })
  }

  if (status?.connected === false) return <NotConfigured tool="Beets" settingKey="BEETS_URL" example="http://192.168.1.x:8337" docs="https://beets.readthedocs.io/en/stable/reference/webinterface.html" />

  return (
    <div className="space-y-4">
      <ConnectionBadge connected={status?.connected} label={status?.connected ? `Beets connected · ${status?.stats?.items ?? '?'} items` : 'Connecting…'} />

      <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSubmitted(true); refetch() } }}
              placeholder="Search by title, artist, album, genre…"
              className="w-full pl-10 pr-4 py-2.5 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm transition-colors" />
          </div>
          <button onClick={() => { setSubmitted(true); refetch() }}
            className="px-4 py-2.5 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold shrink-0 transition-colors">
            Search
          </button>
        </div>

        {isLoading && <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-ph-border/40 rounded-lg animate-pulse" />)}</div>}

        {items?.items?.length > 0 && (
          <div className="space-y-1">
            {items.items.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-ph-bg group transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-ph-text text-sm font-medium truncate">{item.title || '—'}</p>
                  <p className="text-ph-muted text-xs truncate">{item.artist} · {item.album} · {item.genre || 'No genre'} · {item.year || '?'}</p>
                </div>
                <button onClick={() => startEdit(item)}
                  className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-ph-accent/10 text-ph-accent border border-ph-accent/20 rounded-lg text-xs font-medium transition-all">
                  Edit Tags
                </button>
              </div>
            ))}
          </div>
        )}

        {submitted && !isLoading && items?.items?.length === 0 && (
          <p className="text-center text-ph-muted py-8 text-sm">No items found</p>
        )}
      </div>

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-ph-card border border-ph-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-display font-semibold text-ph-text mb-4">Edit Tags</h3>
            <div className="space-y-3 mb-5">
              {['title', 'artist', 'album', 'genre', 'year'].map(field => (
                <div key={field}>
                  <label className="block text-xs text-ph-muted mb-1 capitalize">{field}</label>
                  <input type={field === 'year' ? 'number' : 'text'} value={editTags[field] || ''}
                    onChange={e => setEditTags(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full px-3 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text text-sm focus:outline-none focus:border-ph-accent transition-colors" />
                </div>
              ))}
            </div>
            {updateMutation.isError && (
              <p className="text-red-400 text-xs mb-3">{(updateMutation.error as any)?.response?.data?.detail || 'Update failed'}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => updateMutation.mutate({ id: editingItem.id, tags: editTags })}
                disabled={updateMutation.isPending}
                className="flex-1 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                {updateMutation.isPending ? 'Saving…' : 'Save Tags'}
              </button>
              <button onClick={() => setEditingItem(null)}
                className="px-4 py-2.5 bg-ph-border text-ph-muted rounded-xl text-sm font-semibold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MUSICBRAINZ ──────────────────────────────────────────────────────────────

function MusicBrainzPanel() {
  const [searchType, setSearchType] = useState<'artist' | 'release'>('artist')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [selectedResult, setSelectedResult] = useState<any>(null)

  const { data: status } = useQuery({
    queryKey: ['mb-status'],
    queryFn: () => api.get('/musicbrainz/status').then(r => r.data).catch(() => ({ connected: false })),
    retry: 0,
  })

  const { data: results, isLoading } = useQuery({
    queryKey: ['mb-search', searchType, query],
    queryFn: () => api.get(`/musicbrainz/search/${searchType}`, { params: { query, limit: 15 } }).then(r => r.data),
    enabled: submitted && !!query,
  })

  const { data: detail } = useQuery({
    queryKey: ['mb-detail', searchType, selectedResult?.mbid],
    queryFn: () => api.get(`/musicbrainz/${searchType}/${selectedResult.mbid}`).then(r => r.data),
    enabled: !!selectedResult,
  })

  const doSearch = () => { setSubmitted(true); setSelectedResult(null) }

  const usingPublic = !status?.using || status?.using === 'public'

  return (
    <div className="space-y-4">
      <ConnectionBadge
        connected={status?.connected !== false}
        label={status?.connected === false ? 'Cannot connect' : usingPublic ? 'Using public MusicBrainz API' : `Self-hosted: ${status?.base_url}`}
      />

      <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
        <div className="flex gap-2 mb-4">
          {(['artist', 'release'] as const).map(t => (
            <button key={t} onClick={() => { setSearchType(t); setSubmitted(false); setSelectedResult(null) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${searchType === t ? 'bg-ph-accent/10 text-ph-accent border border-ph-accent/20' : 'text-ph-muted hover:text-ph-text'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder={searchType === 'artist' ? 'Search artists…' : 'Search albums/releases…'}
              className="w-full pl-10 pr-4 py-2.5 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm transition-colors" />
          </div>
          <button onClick={doSearch} className="px-4 py-2.5 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold shrink-0">Search</button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Results list */}
        <div className="flex-1 bg-ph-card border border-ph-border rounded-2xl p-5">
          {isLoading && <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-ph-border/40 rounded animate-pulse" />)}</div>}
          {results?.results?.map((r: any) => (
            <button key={r.mbid} onClick={() => setSelectedResult(r)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${selectedResult?.mbid === r.mbid ? 'bg-ph-accent/10' : 'hover:bg-ph-bg'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-ph-text text-sm font-medium truncate">{r.name || r.title}</p>
                <p className="text-ph-muted text-xs truncate">
                  {r.disambiguation && `${r.disambiguation} · `}
                  {r.country && `${r.country} · `}
                  {r.date && `${r.date} · `}
                  score: {r.score}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-ph-muted shrink-0" />
            </button>
          ))}
          {submitted && !isLoading && results?.results?.length === 0 && <p className="text-ph-muted text-sm text-center py-6">No results</p>}
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="w-72 shrink-0 bg-ph-card border border-ph-border rounded-2xl p-5 self-start sticky top-8">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-ph-text text-sm">{detail.name || detail.title}</h3>
              {detail.url && (
                <a href={`https://musicbrainz.org/${searchType}/${detail.mbid}`} target="_blank" rel="noopener noreferrer"
                  className="text-ph-muted hover:text-ph-accent shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            {detail.genres?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-1.5">Genres</p>
                <div className="flex flex-wrap gap-1">
                  {detail.genres.map((g: string) => (
                    <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-ph-accent/10 text-ph-accent border border-ph-accent/20">{g}</span>
                  ))}
                </div>
              </div>
            )}
            {detail.tags?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {detail.tags.slice(0, 12).map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-ph-border text-ph-muted">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {detail.tracks?.length > 0 && (
              <div>
                <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-1.5">Tracks ({detail.track_count})</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {detail.tracks.map((t: any) => (
                    <div key={t.mbid} className="flex items-center gap-2 text-xs">
                      <span className="text-ph-muted w-4 text-right shrink-0">{t.number}</span>
                      <span className="text-ph-text truncate flex-1">{t.title}</span>
                      {t.length && <span className="text-ph-muted shrink-0">{Math.floor(t.length / 60000)}:{String(Math.floor((t.length % 60000) / 1000)).padStart(2,'0')}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-ph-muted/50 mt-3 font-mono break-all">MBID: {detail.mbid}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PICARD ───────────────────────────────────────────────────────────────────

function PicardPanel() {
  const [paths, setPaths] = useState('')
  const [actionResult, setActionResult] = useState<string>('')

  const { data: status } = useQuery({
    queryKey: ['picard-status'],
    queryFn: () => api.get('/picard/status').then(r => r.data).catch(() => ({ configured: false, connected: false })),
    retry: 0,
  })

  const doAction = async (endpoint: string, label: string, body?: any) => {
    try {
      await api.post(endpoint, body || {})
      setActionResult(`✓ ${label} sent to Picard`)
    } catch (e: any) {
      setActionResult(`✗ ${e?.response?.data?.detail || 'Failed'}`)
    }
    setTimeout(() => setActionResult(''), 4000)
  }

  if (!status?.configured) return <NotConfigured tool="MusicBrainz Picard" settingKey="PICARD_URL" example="http://192.168.1.x:8000" docs="https://picard-docs.musicbrainz.org/en/extending/plugins.html" />

  return (
    <div className="space-y-4">
      <ConnectionBadge connected={status?.connected} label={status?.connected ? `Picard running at ${status?.url}` : `Picard not reachable at ${status?.url}`} />

      <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
        <h3 className="font-display font-semibold text-ph-text mb-1">Load Files for Tagging</h3>
        <p className="text-ph-muted text-xs mb-4">Enter file paths (one per line) to send to Picard for MusicBrainz lookup and auto-tagging.</p>
        <textarea
          value={paths}
          onChange={e => setPaths(e.target.value)}
          placeholder={'/mnt/tank/music/Artist/Album\n/mnt/tank/music/Artist/Album/track.flac'}
          rows={5}
          className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm font-mono resize-none transition-colors mb-3"
        />
        <button
          onClick={() => doAction('/picard/load', 'Load', { paths: paths.split('\n').map(s => s.trim()).filter(Boolean) })}
          disabled={!paths.trim()}
          className="px-4 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Send to Picard
        </button>
      </div>

      <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
        <h3 className="font-display font-semibold text-ph-text mb-4">Picard Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionButton label="Cluster Files" description="Group loaded files into album clusters" onClick={() => doAction('/picard/cluster', 'Cluster')} />
          <ActionButton label="Lookup Tags" description="Match clusters against MusicBrainz" onClick={() => doAction('/picard/lookup', 'Lookup')} />
          <ActionButton label="Save All" description="Write matched tags to files on disk" onClick={() => doAction('/picard/save', 'Save')} variant="accent" />
        </div>
        {actionResult && (
          <p className={`mt-4 text-sm ${actionResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{actionResult}</p>
        )}
      </div>

      <div className="bg-ph-card border border-ph-border/50 rounded-2xl p-5">
        <h4 className="text-sm font-semibold text-ph-text mb-2">Recommended Workflow</h4>
        <ol className="space-y-1.5 text-xs text-ph-muted list-decimal list-inside">
          <li>Enter file/folder paths above and click <span className="text-ph-text">Send to Picard</span></li>
          <li>Click <span className="text-ph-text">Cluster Files</span> to group them by album</li>
          <li>Click <span className="text-ph-text">Lookup Tags</span> — Picard queries MusicBrainz</li>
          <li>Review matches in the Picard UI (if Picard has a display)</li>
          <li>Click <span className="text-ph-text">Save All</span> to write tags to disk</li>
          <li>Refresh Plex metadata so it picks up the new tags</li>
        </ol>
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function ConnectionBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm ${connected ? 'bg-green-500/8 border-green-500/20 text-green-400' : 'bg-red-500/8 border-red-500/20 text-red-400'}`}>
      {connected ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {label}
    </div>
  )
}

function NotConfigured({ tool, settingKey, example, docs }: { tool: string; settingKey: string; example: string; docs: string }) {
  return (
    <div className="bg-ph-card border border-ph-border rounded-2xl p-8 text-center">
      <AlertCircle className="w-10 h-10 text-ph-muted mx-auto mb-3 opacity-40" />
      <h3 className="font-display font-semibold text-ph-text mb-2">{tool} not configured</h3>
      <p className="text-ph-muted text-sm mb-4">
        Set the URL in <span className="font-semibold text-ph-text">Settings → Tagging Tools</span>, or add it to your <span className="font-mono text-ph-text">.env</span> file:
      </p>
      <code className="block bg-ph-bg border border-ph-border rounded-lg px-4 py-2.5 text-sm text-ph-accent font-mono mb-4">
        {settingKey}={example}
      </code>
      <a href={docs} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-ph-accent hover:underline">
        <ExternalLink className="w-3.5 h-3.5" /> View setup docs
      </a>
    </div>
  )
}

function ActionButton({ label, description, onClick, variant = 'default' }: { label: string; description: string; onClick: () => void; variant?: 'default' | 'accent' }) {
  return (
    <button onClick={onClick}
      className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.01] ${variant === 'accent' ? 'bg-ph-accent/10 border-ph-accent/30 hover:bg-ph-accent/15' : 'bg-ph-bg border-ph-border hover:border-ph-accent/30'}`}>
      <p className={`font-semibold text-sm mb-1 ${variant === 'accent' ? 'text-ph-accent' : 'text-ph-text'}`}>{label}</p>
      <p className="text-xs text-ph-muted leading-relaxed">{description}</p>
    </button>
  )
}
