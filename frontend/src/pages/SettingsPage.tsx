import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RotateCcw, Check, Palette, Wrench, ListMusic, Download, Bot, ExternalLink, Eye, EyeOff, Plus, Trash2, ChevronDown } from 'lucide-react'
import api from '../utils/api'

const PRESET_META: Record<string, { label: string; accent: string; dark: boolean }> = {
  dark_indigo:  { label: 'Indigo Night',  accent: '#6d83f2', dark: true  },
  dark_emerald: { label: 'Emerald Dark',  accent: '#34d399', dark: true  },
  dark_rose:    { label: 'Rose Dark',     accent: '#f472b6', dark: true  },
  dark_amber:   { label: 'Amber Dark',    accent: '#fbbf24', dark: true  },
  dark_cyan:    { label: 'Cyan Dark',     accent: '#22d3ee', dark: true  },
  light_clean:  { label: 'Clean Light',   accent: '#4f63d2', dark: false },
  light_warm:   { label: 'Warm Light',    accent: '#d97706', dark: false },
}

const CLIENT_TYPES = [
  { value: 'qbittorrent',   label: 'qBittorrent',             fields: { url: true, username: true, password: true, api_key: false } },
  { value: 'deluge',        label: 'Deluge',                  fields: { url: true, username: false, password: true, api_key: false } },
  { value: 'torrent_generic', label: 'Generic BitTorrent (WebUI)', fields: { url: true, username: true, password: true, api_key: true } },
  { value: 'sabnzbd',       label: 'SABnzbd',                 fields: { url: true, username: true, password: true, api_key: true  } },
  { value: 'nzb_generic',   label: 'Generic Usenet (NZB)',    fields: { url: true, username: true, password: true, api_key: true  } },
]

function applyTheme(t: Record<string, string>) {
  const r = document.documentElement
  ;['bg','card','border','text','muted','accent'].forEach(k => r.style.setProperty(`--ph-${k}`, t[k]))
}

type Tab = 'theme' | 'tools' | 'downloads' | 'ai' | 'playlist'

interface Client { id: string; type: string; label: string; url: string; username: string; password: string; api_key: string }

export default function SettingsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('theme')
  const [saved, setSaved] = useState(false)
  const [theme, setTheme] = useState<Record<string,string>>({})
  const [tools, setTools] = useState({ beets_url: '', musicbrainz_url: '', picard_url: '' })
  const [acq, setAcq] = useState({
    enabled: false,
    lidarr_url: '', lidarr_api_key: '', lidarr_username: '', lidarr_password: '', lidarr_root_folder: '',
    clients: [] as Client[],
  })
  const [ai, setAi] = useState({
    enabled: false, provider: 'none',
    claude_api_key: '', claude_model: 'claude-sonnet-4-20250514',
    openai_api_key: '', openai_model: 'gpt-4o', openai_base_url: 'https://api.openai.com/v1',
    ollama_url: 'http://localhost:11434', ollama_model: 'llama3.1',
    custom_url: '', custom_port: '', custom_username: '', custom_password: '', custom_api_key: '', custom_model: '',
  })
  const [pld, setPld] = useState({ max_tracks: 50, min_duration_minutes: '' as any, max_duration_minutes: '' as any, push_to_plex: true, shuffle: false })
  const [tests, setTests] = useState<Record<string,string>>({})
  const [aiTest, setAiTest] = useState<any>(null)
  const [aiTesting, setAiTesting] = useState(false)
  const [newClientType, setNewClientType] = useState('qbittorrent')

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings/').then(r => r.data) })
  const { data: presets } = useQuery({ queryKey: ['theme-presets'], queryFn: () => api.get('/settings/themes/presets').then(r => r.data) })

  useEffect(() => {
    if (!settings) return
    if (settings.theme) setTheme(settings.theme)
    if (settings.tools) setTools(settings.tools)
    if (settings.acquisition) setAcq(settings.acquisition)
    if (settings.ai) setAi(settings.ai)
    if (settings.playlist_defaults) {
      const d = settings.playlist_defaults
      setPld({ ...d, min_duration_minutes: d.min_duration_minutes ?? '', max_duration_minutes: d.max_duration_minutes ?? '' })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/settings/', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      if (data.theme) applyTheme(data.theme)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const presetMutation = useMutation({
    mutationFn: (name: string) => api.post(`/settings/themes/preset/${name}`).then(r => r.data),
    onSuccess: (data) => { setTheme(data.theme); applyTheme(data.theme); qc.setQueryData(['settings'], data) },
  })

  const handleSave = () => {
    saveMutation.mutate({
      theme, tools, acquisition: acq, ai,
      playlist_defaults: { ...pld, min_duration_minutes: pld.min_duration_minutes !== '' ? Number(pld.min_duration_minutes) : null, max_duration_minutes: pld.max_duration_minutes !== '' ? Number(pld.max_duration_minutes) : null },
    })
  }

  const testConn = async (key: string, endpoint: string) => {
    setTests(p => ({ ...p, [key]: 'testing' }))
    try {
      const r = await api.get(endpoint)
      setTests(p => ({ ...p, [key]: r.data?.connected ? 'ok' : 'fail' }))
    } catch { setTests(p => ({ ...p, [key]: 'fail' })) }
  }

  const testAI = async () => {
    setAiTesting(true); setAiTest(null)
    try {
      await api.put('/settings/', { ai })
      const r = await api.get('/ai/status')
      setAiTest(r.data)
    } catch (e: any) { setAiTest({ test: { ok: false, error: e?.response?.data?.detail || 'Test failed' } }) }
    setAiTesting(false)
  }

  const addClient = () => {
    const def = CLIENT_TYPES.find(c => c.value === newClientType)!
    const newClient: Client = { id: `${newClientType}_${Date.now()}`, type: newClientType, label: def.label, url: '', username: '', password: '', api_key: '' }
    setAcq(p => ({ ...p, clients: [...p.clients, newClient] }))
  }

  const updateClient = (id: string, field: string, val: string) => {
    setAcq(p => ({ ...p, clients: p.clients.map(c => c.id === id ? { ...c, [field]: val } : c) }))
  }

  const removeClient = (id: string) => {
    setAcq(p => ({ ...p, clients: p.clients.filter(c => c.id !== id) }))
  }

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'theme',    label: 'Appearance',       icon: Palette  },
    { id: 'tools',    label: 'Tag Tools',         icon: Wrench   },
    { id: 'downloads',label: 'Downloads',         icon: Download },
    { id: 'ai',       label: 'AI Provider',       icon: Bot      },
    { id: 'playlist', label: 'Playlist Defaults', icon: ListMusic},
  ]

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-ph-card rounded-xl animate-pulse" />)}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-ph-text">Settings</h1>
          <p className="text-ph-muted text-sm mt-0.5">Configure appearance, tools, and integrations</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { api.post('/settings/reset').then(() => qc.invalidateQueries({ queryKey: ['settings'] })) }} className="flex items-center gap-2 px-3 py-2 text-ph-muted hover:text-ph-text border border-ph-border rounded-xl text-sm transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />Reset
          </button>
          <button onClick={handleSave} disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold transition-colors">
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-ph-card border border-ph-border rounded-xl mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-ph-accent text-white' : 'text-ph-muted hover:text-ph-text'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── THEME ─────────────────────────────────────────────────────── */}
      {tab === 'theme' && (
        <div className="space-y-5">
          <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-ph-text mb-4">Presets</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(PRESET_META).map(([key, meta]) => (
                <button key={key} onClick={() => presetMutation.mutate(key)} disabled={presetMutation.isPending}
                  className={`p-3 rounded-xl border text-left transition-all ${theme.accent === meta.accent ? 'border-ph-accent bg-ph-accent/8' : 'border-ph-border hover:border-ph-accent/40'}`}>
                  <div className="w-full h-7 rounded-lg mb-2" style={{ background: meta.accent, opacity: meta.dark ? 1 : 0.7 }} />
                  <p className="text-xs font-medium text-ph-text">{meta.label}</p>
                  <p className="text-xs text-ph-muted">{meta.dark ? 'Dark' : 'Light'}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-ph-text mb-1">Custom Colors</h2>
            <p className="text-ph-muted text-xs mb-4">Changes apply on Save.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[['accent','Accent'],['bg','Background'],['card','Card'],['border','Border'],['text','Primary Text'],['muted','Muted Text']].map(([k, label]) => (
                <div key={k} className="flex items-center gap-3">
                  <input type="color" value={theme[k] || '#000000'} onChange={e => setTheme(p => ({ ...p, [k]: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-ph-border bg-transparent shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-ph-text">{label}</p>
                    <p className="text-xs text-ph-muted font-mono">{theme[k] || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAG TOOLS ─────────────────────────────────────────────────── */}
      {tab === 'tools' && (
        <div className="space-y-4">
          {[
            { key: 'beets', label: 'Beets', field: 'beets_url', ep: '/beets/status', ph: 'http://192.168.1.x:8337', hint: 'Enable the web plugin in beets config.yaml — set host: 0.0.0.0', docs: 'https://beets.readthedocs.io/en/stable/reference/webinterface.html' },
            { key: 'mb',    label: 'MusicBrainz (self-hosted)', field: 'musicbrainz_url', ep: '/musicbrainz/status', ph: 'http://192.168.1.x:5000', hint: 'Leave blank to use the free public API', docs: 'https://github.com/metabrainz/musicbrainz-docker' },
            { key: 'picard',label: 'MusicBrainz Picard', field: 'picard_url', ep: '/picard/status', ph: 'http://192.168.1.x:8000', hint: 'Requires the Picard server plugin', docs: 'https://picard-docs.musicbrainz.org/' },
          ].map(cfg => (
            <div key={cfg.key} className="bg-ph-card border border-ph-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-ph-text">{cfg.label}</h3>
                <a href={cfg.docs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-ph-muted hover:text-ph-accent transition-colors"><ExternalLink className="w-3 h-3" />Docs</a>
              </div>
              <div className="flex gap-3 mb-2">
                <input type="text" value={(tools as any)[cfg.field]} onChange={e => setTools(p => ({ ...p, [cfg.field]: e.target.value }))} placeholder={cfg.ph}
                  className="flex-1 px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm font-mono transition-colors" />
                <button onClick={() => { saveMutation.mutate({ tools }); testConn(cfg.key, cfg.ep) }} disabled={tests[cfg.key] === 'testing' || !(tools as any)[cfg.field]}
                  className="px-4 py-2.5 bg-ph-border hover:bg-ph-border/70 disabled:opacity-40 text-ph-text rounded-lg text-sm font-medium transition-colors shrink-0">
                  {tests[cfg.key] === 'testing' ? 'Testing…' : 'Test'}
                </button>
              </div>
              {tests[cfg.key] === 'ok'   && <p className="text-xs text-green-400">✓ Connected</p>}
              {tests[cfg.key] === 'fail' && <p className="text-xs text-red-400">✗ Could not connect</p>}
              <p className="text-xs text-ph-muted/60 mt-1 italic">{cfg.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── DOWNLOADS ─────────────────────────────────────────────────── */}
      {tab === 'downloads' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-ph-card border border-ph-border rounded-xl">
            <Toggle value={acq.enabled} onChange={v => setAcq(p => ({ ...p, enabled: v }))} />
            <div>
              <p className="text-sm font-medium text-ph-text">Enable acquisition integrations</p>
              <p className="text-xs text-ph-muted">Shows "Add to Lidarr" buttons on Discovery and AI pages</p>
            </div>
          </div>

          {/* Lidarr — permanent */}
          <Section title="Lidarr" docs="https://lidarr.audio" docsLabel="lidarr.audio">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="URL" value={acq.lidarr_url} onChange={v => setAcq(p => ({ ...p, lidarr_url: v }))} placeholder="http://192.168.1.x:8686" />
              <SecretField label="API Key" value={acq.lidarr_api_key} onChange={v => setAcq(p => ({ ...p, lidarr_api_key: v }))} placeholder="Settings → General → Security" />
              <Field label="Username (if auth enabled)" value={acq.lidarr_username} onChange={v => setAcq(p => ({ ...p, lidarr_username: v }))} placeholder="admin" />
              <SecretField label="Password (if auth enabled)" value={acq.lidarr_password} onChange={v => setAcq(p => ({ ...p, lidarr_password: v }))} placeholder="optional" />
              <Field label="Root Folder" value={acq.lidarr_root_folder} onChange={v => setAcq(p => ({ ...p, lidarr_root_folder: v }))} placeholder="/music" />
              <div className="flex items-end">
                <TestBtn result={tests['lidarr']} onTest={() => { saveMutation.mutate({ acquisition: acq }); testConn('lidarr', '/lidarr/status') }} />
              </div>
            </div>
          </Section>

          {/* Connected clients */}
          <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-ph-text">Download Clients</h3>
                <p className="text-ph-muted text-xs mt-0.5">Add torrent and Usenet clients</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select value={newClientType} onChange={e => setNewClientType(e.target.value)}
                    className="pl-3 pr-8 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text text-sm focus:outline-none focus:border-ph-accent appearance-none">
                    {CLIENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ph-muted pointer-events-none" />
                </div>
                <button onClick={addClient}
                  className="flex items-center gap-1.5 px-3 py-2 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-lg text-sm font-semibold transition-colors shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Connect
                </button>
              </div>
            </div>

            {acq.clients.length === 0 ? (
              <div className="text-center py-8 text-ph-muted text-sm border border-dashed border-ph-border rounded-xl">
                Select a client type above and click Connect to add it
              </div>
            ) : (
              <div className="space-y-4">
                {acq.clients.map((client) => {
                  const def = CLIENT_TYPES.find(c => c.value === client.type)!
                  return (
                    <div key={client.id} className="bg-ph-bg border border-ph-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-ph-text text-sm">{def.label}</h4>
                        <div className="flex items-center gap-2">
                          {tests[client.id] === 'ok'   && <span className="text-xs text-green-400">✓ Connected</span>}
                          {tests[client.id] === 'fail' && <span className="text-xs text-red-400">✗ Failed</span>}
                          <button onClick={() => testConn(client.id, `/${client.type === 'qbittorrent' ? 'qbittorrent' : client.type === 'deluge' ? 'deluge' : client.type === 'sabnzbd' ? 'sabnzbd' : ''}/status`)} disabled={tests[client.id] === 'testing' || !client.url || !['qbittorrent','deluge','sabnzbd'].includes(client.type)}
                            className="px-3 py-1.5 bg-ph-card border border-ph-border hover:border-ph-accent/40 text-ph-muted rounded-lg text-xs transition-colors disabled:opacity-40">
                            {tests[client.id] === 'testing' ? '…' : 'Test'}
                          </button>
                          <button onClick={() => removeClient(client.id)} className="p-1.5 text-ph-muted hover:text-red-400 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="URL" value={client.url} onChange={v => updateClient(client.id, 'url', v)} placeholder="http://192.168.1.x:8080" />
                        {def.fields.username && <Field label="Username" value={client.username} onChange={v => updateClient(client.id, 'username', v)} placeholder="admin" />}
                        {def.fields.password && <SecretField label="Password" value={client.password} onChange={v => updateClient(client.id, 'password', v)} placeholder="••••••••" />}
                        {def.fields.api_key  && <SecretField label="API Key" value={client.api_key} onChange={v => updateClient(client.id, 'api_key', v)} placeholder="optional" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI PROVIDER ───────────────────────────────────────────────── */}
      {tab === 'ai' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-ph-card border border-ph-border rounded-xl">
            <Toggle value={ai.enabled} onChange={v => setAi(p => ({ ...p, enabled: v }))} />
            <div>
              <p className="text-sm font-medium text-ph-text">Enable AI features</p>
              <p className="text-xs text-ph-muted">Smart Playlist, AI Discovery, Music Chat</p>
            </div>
          </div>

          {ai.enabled && (
            <>
              <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
                <h3 className="font-display font-semibold text-ph-text mb-4">Select Provider</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'claude', name: 'Claude',    desc: 'Best reasoning\nPay per use',    docs: 'https://console.anthropic.com' },
                    { id: 'openai', name: 'ChatGPT',   desc: 'GPT-4o quality\nPay per use',   docs: 'https://platform.openai.com' },
                    { id: 'ollama', name: 'Ollama',    desc: 'Fully local\nFree & private',   docs: 'https://ollama.com' },
                    { id: 'custom', name: 'Custom / Self-hosted', desc: 'Any OpenAI-compat\nendpoint', docs: 'https://github.com/ggerganov/llama.cpp' },
                  ].map(p => (
                    <button key={p.id} onClick={() => setAi(prev => ({ ...prev, provider: p.id }))}
                      className={`p-3 rounded-xl border text-left transition-all ${ai.provider === p.id ? 'border-ph-accent bg-ph-accent/8' : 'border-ph-border hover:border-ph-accent/30'}`}>
                      <div className="flex items-start justify-between mb-1">
                        <p className="font-semibold text-ph-text text-sm">{p.name}</p>
                        <a href={p.docs} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-ph-muted hover:text-ph-accent"><ExternalLink className="w-3 h-3" /></a>
                      </div>
                      <p className="text-xs text-ph-muted whitespace-pre-line leading-relaxed">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Claude */}
              {ai.provider === 'claude' && (
                <Section title="Claude configuration" docs="https://console.anthropic.com/settings/keys" docsLabel="Get API key">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SecretField label="API Key" value={ai.claude_api_key} onChange={v => setAi(p => ({ ...p, claude_api_key: v }))} placeholder="sk-ant-api03-…" />
                    <div>
                      <label className="block text-xs text-ph-muted mb-1.5">Model</label>
                      <select value={ai.claude_model} onChange={e => setAi(p => ({ ...p, claude_model: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text text-sm focus:outline-none focus:border-ph-accent appearance-none">
                        <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (recommended)</option>
                        <option value="claude-opus-4-20250514">Claude Opus 4</option>
                        <option value="claude-haiku-4-5-20251001">Claude Haiku</option>
                      </select>
                    </div>
                  </div>
                </Section>
              )}

              {/* OpenAI */}
              {ai.provider === 'openai' && (
                <Section title="OpenAI configuration" docs="https://platform.openai.com/api-keys" docsLabel="Get API key">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SecretField label="API Key" value={ai.openai_api_key} onChange={v => setAi(p => ({ ...p, openai_api_key: v }))} placeholder="sk-proj-…" />
                    <div>
                      <label className="block text-xs text-ph-muted mb-1.5">Model</label>
                      <select value={ai.openai_model} onChange={e => setAi(p => ({ ...p, openai_model: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text text-sm focus:outline-none focus:border-ph-accent appearance-none">
                        <option value="gpt-4o">GPT-4o (recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Base URL (change for OpenAI-compatible APIs)" value={ai.openai_base_url} onChange={v => setAi(p => ({ ...p, openai_base_url: v }))} placeholder="https://api.openai.com/v1" />
                    </div>
                  </div>
                </Section>
              )}

              {/* Ollama */}
              {ai.provider === 'ollama' && (
                <Section title="Ollama configuration" docs="https://ollama.com/library" docsLabel="Browse models">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Ollama URL" value={ai.ollama_url} onChange={v => setAi(p => ({ ...p, ollama_url: v }))} placeholder="http://192.168.1.x:11434" />
                    <Field label="Model" value={ai.ollama_model} onChange={v => setAi(p => ({ ...p, ollama_model: v }))} placeholder="llama3.1" />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['llama3.1','llama3.1:8b','mistral','qwen2','mixtral'].map(m => (
                      <button key={m} onClick={() => setAi(p => ({ ...p, ollama_model: m }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${ai.ollama_model === m ? 'bg-ph-accent/10 text-ph-accent border-ph-accent/30' : 'bg-ph-card border-ph-border text-ph-muted hover:text-ph-text'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-ph-muted/60 mt-2 italic">Pull with: <code className="font-mono">ollama pull {ai.ollama_model}</code></p>
                </Section>
              )}

              {/* Custom / self-hosted */}
              {ai.provider === 'custom' && (
                <Section title="Custom / self-hosted endpoint" docs="https://github.com/ggerganov/llama.cpp" docsLabel="Compatible servers">
                  <p className="text-xs text-ph-muted mb-4">Works with LM Studio, LocalAI, Jan, llama.cpp server, text-generation-webui, Koboldcpp, and any OpenAI-compatible API.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="IP / Hostname" value={ai.custom_url} onChange={v => setAi(p => ({ ...p, custom_url: v }))} placeholder="http://192.168.1.x" />
                    <Field label="Port" value={ai.custom_port} onChange={v => setAi(p => ({ ...p, custom_port: v }))} placeholder="1234" />
                    <Field label="Model name (leave blank for server default)" value={ai.custom_model} onChange={v => setAi(p => ({ ...p, custom_model: v }))} placeholder="e.g. llama-3.1-8b-instruct" />
                    <SecretField label="API Key (optional)" value={ai.custom_api_key} onChange={v => setAi(p => ({ ...p, custom_api_key: v }))} placeholder="optional" />
                    <Field label="Username (optional)" value={ai.custom_username} onChange={v => setAi(p => ({ ...p, custom_username: v }))} placeholder="optional" />
                    <SecretField label="Password (optional)" value={ai.custom_password} onChange={v => setAi(p => ({ ...p, custom_password: v }))} placeholder="optional" />
                  </div>
                  <p className="text-xs text-ph-muted/60 mt-3 italic">
                    PlexHarmony will POST to <code className="font-mono">{ai.custom_url}{ai.custom_port ? `:${ai.custom_port}` : ''}/v1/chat/completions</code>
                  </p>
                </Section>
              )}

              {/* Test button */}
              <div className="flex items-center gap-3">
                <button onClick={testAI} disabled={aiTesting || ai.provider === 'none'}
                  className="px-5 py-2.5 bg-ph-border hover:bg-ph-border/70 disabled:opacity-40 text-ph-text rounded-xl text-sm font-semibold transition-colors">
                  {aiTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {aiTest?.test?.ok   && <span className="text-sm text-green-400">✓ Connected — replied: "{aiTest.test.response}"</span>}
                {aiTest?.test?.ok === false && <span className="text-sm text-red-400">✗ {aiTest.test.error}</span>}
                {aiTest?.test?.available_models?.length > 0 && (
                  <span className="text-xs text-ph-muted">Available models: {aiTest.test.available_models.join(', ')}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PLAYLIST DEFAULTS ─────────────────────────────────────────── */}
      {tab === 'playlist' && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
          <h2 className="font-display font-semibold text-ph-text mb-1">Playlist Defaults</h2>
          <p className="text-ph-muted text-xs mb-5">Pre-fill the playlist creation form.</p>
          <div className="space-y-5 max-w-md">
            <div>
              <label className="block text-sm text-ph-muted mb-1.5">Max Tracks: {pld.max_tracks}</label>
              <input type="range" min={5} max={500} step={5} value={pld.max_tracks} onChange={e => setPld(p => ({ ...p, max_tracks: +e.target.value }))} className="w-full accent-ph-accent" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-ph-muted mb-1.5">Min Duration (min)</label><input type="number" min={1} max={600} value={pld.min_duration_minutes} onChange={e => setPld(p => ({ ...p, min_duration_minutes: e.target.value }))} placeholder="None" className="w-full px-3 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm" /></div>
              <div><label className="block text-xs text-ph-muted mb-1.5">Max Duration (min)</label><input type="number" min={1} max={600} value={pld.max_duration_minutes} onChange={e => setPld(p => ({ ...p, max_duration_minutes: e.target.value }))} placeholder="None" className="w-full px-3 py-2 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm" /></div>
            </div>
            <div className="flex flex-col gap-3">
              <Toggle label="Push to Plex by default" value={pld.push_to_plex} onChange={v => setPld(p => ({ ...p, push_to_plex: v }))} />
              <Toggle label="Shuffle by default" value={pld.shuffle} onChange={v => setPld(p => ({ ...p, shuffle: v }))} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-ph-accent' : 'bg-ph-border'}`}>
        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      {label && <span className="text-sm text-ph-text">{label}</span>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-ph-muted mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm font-mono transition-colors" />
    </div>
  )
}

function SecretField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  const isMasked = value.startsWith('*')
  return (
    <div>
      <label className="block text-xs text-ph-muted mb-1.5">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2.5 pr-10 bg-ph-bg border border-ph-border rounded-lg text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm font-mono transition-colors" />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ph-muted hover:text-ph-text">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {isMasked && <p className="text-xs text-ph-muted/60 mt-1 italic">Saved — type to replace</p>}
    </div>
  )
}

function Section({ title, docs, docsLabel, children }: { title: string; docs?: string; docsLabel?: string; children: React.ReactNode }) {
  return (
    <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-ph-text">{title}</h3>
        {docs && <a href={docs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-ph-muted hover:text-ph-accent transition-colors"><ExternalLink className="w-3 h-3" />{docsLabel}</a>}
      </div>
      {children}
    </div>
  )
}

function TestBtn({ result, onTest }: { result?: string; onTest: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onTest} disabled={result === 'testing'} className="px-4 py-2.5 bg-ph-border hover:bg-ph-border/70 disabled:opacity-50 text-ph-text rounded-lg text-sm font-medium transition-colors">
        {result === 'testing' ? 'Testing…' : 'Test Connection'}
      </button>
      {result === 'ok'   && <span className="text-green-400 text-sm">✓ Connected</span>}
      {result === 'fail' && <span className="text-red-400 text-sm">✗ Failed</span>}
    </div>
  )
}
