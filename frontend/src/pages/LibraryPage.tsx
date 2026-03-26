import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight, Music2, Disc } from 'lucide-react'
import api from '../utils/api'

export default function LibraryPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedArtist, setSelectedArtist] = useState<any>(null)
  const LIMIT = 30

  // Debounce search
  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout((window as any)._searchTimer)
    ;(window as any)._searchTimer = setTimeout(() => {
      setDebouncedSearch(val)
      setOffset(0)
    }, 400)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['artists', debouncedSearch, offset],
    queryFn: () =>
      api.get('/plex/artists', {
        params: { limit: LIMIT, offset, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
      }).then(r => r.data),
  })

  const { data: artistDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['artist-detail', selectedArtist?.id],
    queryFn: () => api.get(`/plex/artists/${selectedArtist.id}`).then(r => r.data),
    enabled: !!selectedArtist,
  })

  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="flex gap-6">
      {/* Left: Artist list */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-ph-text">Library</h1>
            <p className="text-ph-muted text-sm mt-0.5">{total} artists</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ph-muted" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search artists…"
            className="w-full pl-10 pr-4 py-2.5 bg-ph-card border border-ph-border rounded-xl text-ph-text placeholder-ph-muted focus:outline-none focus:border-ph-accent transition-colors"
          />
        </div>

        {/* Artist grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 bg-ph-card border border-ph-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data?.artists?.map((artist: any) => (
              <button
                key={artist.id}
                onClick={() => setSelectedArtist(artist)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedArtist?.id === artist.id
                    ? 'bg-ph-accent/10 border-ph-accent/30'
                    : 'bg-ph-card border-ph-border hover:border-ph-accent/30'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {artist.thumb ? (
                    <img src={artist.thumb} alt="" className="w-9 h-9 rounded-lg object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-ph-accent/10 flex items-center justify-center">
                      <Music2 className="w-4 h-4 text-ph-accent" />
                    </div>
                  )}
                  <span className="font-medium text-ph-text text-sm truncate">{artist.title}</span>
                </div>
                {artist.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {artist.genres.slice(0, 2).map((g: string) => (
                      <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-ph-border text-ph-muted">{g}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
              className="p-2 rounded-lg border border-ph-border text-ph-muted hover:text-ph-text disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-ph-muted text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="p-2 rounded-lg border border-ph-border text-ph-muted hover:text-ph-text disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Artist detail panel */}
      {selectedArtist && (
        <div className="w-72 shrink-0">
          <div className="bg-ph-card border border-ph-border rounded-2xl p-5 sticky top-8">
            {detailLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-5 bg-ph-border rounded w-3/4" />
                <div className="h-3 bg-ph-border rounded w-1/2" />
                <div className="h-20 bg-ph-border rounded" />
              </div>
            ) : artistDetail ? (
              <>
                <h2 className="font-display font-bold text-ph-text text-lg mb-1">{artistDetail.title}</h2>
                {artistDetail.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {artistDetail.genres.map((g: string) => (
                      <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-ph-accent/10 text-ph-accent">{g}</span>
                    ))}
                  </div>
                )}
                {artistDetail.summary && (
                  <p className="text-ph-muted text-xs leading-relaxed mb-4 line-clamp-4">{artistDetail.summary}</p>
                )}
                {artistDetail.similar?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-ph-muted uppercase tracking-wider mb-2">Similar in Library</p>
                    <div className="flex flex-wrap gap-1">
                      {artistDetail.similar.slice(0, 6).map((s: string) => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-ph-border text-ph-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-ph-muted uppercase tracking-wider mb-2">Albums ({artistDetail.albums?.length})</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {artistDetail.albums?.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        {a.thumb ? (
                          <img src={a.thumb} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-ph-border flex items-center justify-center shrink-0">
                            <Disc className="w-3 h-3 text-ph-muted" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-ph-text truncate text-xs font-medium">{a.title}</p>
                          <p className="text-ph-muted text-xs">{a.year} · {a.trackCount} tracks</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
