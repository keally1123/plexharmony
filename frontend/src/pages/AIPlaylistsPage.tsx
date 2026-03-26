import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, Send, Bot, User, ListMusic, AlertCircle, Lightbulb } from 'lucide-react'
import api from '../utils/api'

type AIMode = 'playlist' | 'discover' | 'chat'

const EXAMPLES: Record<AIMode, string[]> = {
  playlist: [
    'Late night study session, ambient and instrumental only',
    'High energy workout mix, no ballads',
    'Sunday morning coffee, acoustic folk and soft indie',
    'Road trip playlist that builds energy over 2 hours',
    'Similar to Radiohead but more electronic, around 45 minutes',
  ],
  discover: [
    'Artists like Portishead but more modern',
    'Post-rock bands similar to what I already have',
    'Jazz artists I might not know about based on my library',
    'Electronic music similar to my collection but more experimental',
  ],
  chat: [
    'What genres do I have the most of?',
    'Suggest a theme for a dinner party playlist from my library',
    'Which of my artists are most similar to each other?',
    'Help me build a playlist progression for a long drive',
  ],
}

export default function AIPlaylistsPage() {
  const [mode, setMode] = useState<AIMode>('playlist')
  const [input, setInput] = useState('')
  const [pushToPlex, setPushToPlex] = useState(true)
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; content: string }>>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get('/ai/status').then(r => r.data).catch(() => ({ enabled: false })),
    retry: 0,
  })

  const playlistMutation = useMutation({
    mutationFn: (prompt: string) => api.post('/ai/playlist', { prompt, push_to_plex: pushToPlex }).then(r => r.data),
  })

  const discoverMutation = useMutation({
    mutationFn: (prompt: string) => api.post('/ai/discover', { prompt }).then(r => r.data),
  })

  const chatMutation = useMutation({
    mutationFn: (prompt: string) => api.post('/ai/chat', { prompt }).then(r => r.data),
    onSuccess: (data, prompt) => {
      setChatHistory(h => [...h, { role: 'user', content: prompt }, { role: 'ai', content: data.response }])
      setInput('')
    },
  })

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const handleSubmit = () => {
    if (!input.trim()) return
    if (mode === 'playlist') playlistMutation.mutate(input)
    else if (mode === 'discover') discoverMutation.mutate(input)
    else chatMutation.mutate(input)
    if (mode !== 'chat') setInput('')
  }

  const MODES: { id: AIMode; label: string; icon: any }[] = [
    { id: 'playlist', label: 'Smart Playlist', icon: ListMusic },
    { id: 'discover', label: 'Discover',       icon: Sparkles },
    { id: 'chat',     label: 'Chat',           icon: Bot },
  ]

  if (!aiStatus?.enabled) return <AINotConfigured />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-ph-text">AI Assistant</h1>
        <p className="text-ph-muted text-sm mt-0.5">
          Powered by {aiStatus?.provider === 'claude' ? 'Claude' : aiStatus?.provider === 'openai' ? 'ChatGPT' : 'Local AI (Ollama)'}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-ph-card border border-ph-border rounded-xl mb-6 w-fit">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setMode(id); playlistMutation.reset(); discoverMutation.reset() }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === id ? 'bg-ph-accent text-white' : 'text-ph-muted hover:text-ph-text'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* PLAYLIST MODE */}
      {mode === 'playlist' && (
        <div className="space-y-5">
          <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
            <p className="text-ph-muted text-sm mb-4">Describe the playlist you want in plain English. The AI will analyze your library and build it.</p>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
              rows={3} placeholder="e.g. A rainy day playlist, mostly indie and folk, around 45 minutes…"
              className="w-full px-4 py-3 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm resize-none transition-colors mb-3" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <button type="button" onClick={() => setPushToPlex(p => !p)}
                  className={`w-9 h-5 rounded-full transition-colors ${pushToPlex ? 'bg-ph-accent' : 'bg-ph-border'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${pushToPlex ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-ph-text">Push to Plex</span>
              </label>
              <button onClick={handleSubmit} disabled={!input.trim() || playlistMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                {playlistMutation.isPending ? <><span className="animate-spin">◌</span> Thinking…</> : <><Sparkles className="w-4 h-4" /> Generate</>}
              </button>
            </div>
          </div>

          {/* Examples */}
          <div>
            <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Lightbulb className="w-3 h-3" /> Try these</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.playlist.map(ex => (
                <button key={ex} onClick={() => setInput(ex)} className="text-xs px-3 py-1.5 bg-ph-card border border-ph-border hover:border-ph-accent/40 text-ph-muted hover:text-ph-text rounded-full transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {playlistMutation.isError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {(playlistMutation.error as any)?.response?.data?.detail || 'Generation failed'}
            </div>
          )}

          {/* Result */}
          {playlistMutation.data && <PlaylistResult data={playlistMutation.data} />}
        </div>
      )}

      {/* DISCOVER MODE */}
      {mode === 'discover' && (
        <div className="space-y-5">
          <div className="bg-ph-card border border-ph-border rounded-2xl p-6">
            <p className="text-ph-muted text-sm mb-4">Ask the AI to suggest new music based on your library and tastes.</p>
            <div className="flex gap-3">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g. Artists like Radiohead but more electronic…"
                className="flex-1 px-4 py-2.5 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm transition-colors" />
              <button onClick={handleSubmit} disabled={!input.trim() || discoverMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shrink-0">
                {discoverMutation.isPending ? '…' : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.discover.map(ex => (
              <button key={ex} onClick={() => setInput(ex)} className="text-xs px-3 py-1.5 bg-ph-card border border-ph-border hover:border-ph-accent/40 text-ph-muted hover:text-ph-text rounded-full transition-colors">{ex}</button>
            ))}
          </div>

          {discoverMutation.data && <DiscoverResult data={discoverMutation.data} />}
        </div>
      )}

      {/* CHAT MODE */}
      {mode === 'chat' && (
        <div className="space-y-4">
          <div className="bg-ph-card border border-ph-border rounded-2xl overflow-hidden">
            <div className="h-96 overflow-y-auto p-5 space-y-4">
              {chatHistory.length === 0 && (
                <div className="text-center py-12">
                  <Bot className="w-10 h-10 text-ph-muted mx-auto mb-3 opacity-40" />
                  <p className="text-ph-muted text-sm">Ask anything about your music library</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {EXAMPLES.chat.map(ex => (
                      <button key={ex} onClick={() => setInput(ex)} className="text-xs px-3 py-1.5 bg-ph-bg border border-ph-border hover:border-ph-accent/40 text-ph-muted hover:text-ph-text rounded-full transition-colors">{ex}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-7 h-7 rounded-full bg-ph-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-ph-accent" />
                    </div>
                  )}
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-ph-accent text-white rounded-tr-sm' : 'bg-ph-bg border border-ph-border text-ph-text rounded-tl-sm'}`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-ph-border flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-ph-muted" />
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-ph-accent/10 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-ph-accent" />
                  </div>
                  <div className="px-4 py-2.5 bg-ph-bg border border-ph-border rounded-2xl rounded-tl-sm">
                    <span className="flex gap-1">{[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-ph-muted rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-ph-border p-4 flex gap-3">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Ask about your music library…"
                className="flex-1 px-4 py-2.5 bg-ph-bg border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent text-sm transition-colors" />
              <button onClick={handleSubmit} disabled={!input.trim() || chatMutation.isPending}
                className="p-2.5 bg-ph-accent hover:bg-ph-accent/90 disabled:opacity-50 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlaylistResult({ data }: { data: any }) {
  return (
    <div className="bg-ph-card border border-ph-accent/25 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-ph-accent/10 flex items-center justify-center shrink-0">
          <ListMusic className="w-5 h-5 text-ph-accent" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-ph-text">{data.name}</h3>
          <p className="text-ph-muted text-sm">{data.track_count} tracks · {data.total_minutes}m</p>
        </div>
        {data.plex_playlist_id && <span className="ml-auto text-xs px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full shrink-0">In Plex ✓</span>}
      </div>
      {data.reasoning && (
        <div className="p-3 bg-ph-bg rounded-xl mb-4 border border-ph-border">
          <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-1">AI Reasoning</p>
          <p className="text-ph-text text-sm">{data.reasoning}</p>
        </div>
      )}
      <div className="max-h-56 overflow-y-auto space-y-0">
        {data.tracks?.map((t: any, i: number) => (
          <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-ph-border/40 last:border-0">
            <span className="text-ph-muted text-xs w-5 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0"><p className="text-ph-text text-sm truncate">{t.title}</p><p className="text-ph-muted text-xs truncate">{t.artist}</p></div>
            <span className="text-ph-muted text-xs shrink-0">{t.duration ? `${Math.floor(t.duration/60000)}:${String(Math.floor((t.duration%60000)/1000)).padStart(2,'0')}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiscoverResult({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.reasoning && (
        <div className="p-4 bg-ph-card border border-ph-border rounded-2xl">
          <p className="text-xs text-ph-muted font-semibold uppercase tracking-wider mb-1.5">AI Reasoning</p>
          <p className="text-ph-text text-sm">{data.reasoning}</p>
        </div>
      )}
      {data.suggested_artists?.length > 0 && (
        <div className="bg-ph-card border border-ph-border rounded-2xl p-5">
          <h3 className="font-display font-semibold text-ph-text mb-3">Suggested Artists</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.suggested_artists.map((a: string) => (
              <div key={a} className="p-3 bg-ph-bg rounded-xl border border-ph-border">
                <p className="text-ph-text text-sm font-medium">{a}</p>
                {data.in_library?.[a] ? (
                  <span className="text-xs text-green-400">In library</span>
                ) : (
                  <span className="text-xs text-ph-accent">New discovery</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AINotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 text-center">
      <div className="w-16 h-16 rounded-2xl bg-ph-accent/10 border border-ph-accent/20 flex items-center justify-center mb-5">
        <Sparkles className="w-8 h-8 text-ph-accent" />
      </div>
      <h2 className="text-xl font-display font-bold text-ph-text mb-2">AI not configured</h2>
      <p className="text-ph-muted text-sm max-w-sm mb-6">Enable an AI provider in Settings to use smart playlists, natural language discovery, and music chat.</p>
      <a href="/settings" className="flex items-center gap-2 px-5 py-2.5 bg-ph-accent hover:bg-ph-accent/90 text-white rounded-xl text-sm font-semibold transition-colors">
        Go to Settings
      </a>
      <div className="mt-8 grid grid-cols-3 gap-3 max-w-lg">
        {[
          { name: 'Claude', desc: 'Best reasoning\nPay per use' },
          { name: 'ChatGPT', desc: 'GPT-4o quality\nPay per use' },
          { name: 'Ollama', desc: 'Fully local\nFree & private' },
        ].map(p => (
          <div key={p.name} className="p-3 bg-ph-card border border-ph-border rounded-xl text-center">
            <p className="font-semibold text-ph-text text-sm">{p.name}</p>
            <p className="text-ph-muted text-xs mt-0.5 whitespace-pre-line">{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
