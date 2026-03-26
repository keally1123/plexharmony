"""
Plex router - read music library, artists, albums, tracks
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from plexapi.server import PlexServer
from plexapi.exceptions import Unauthorized, NotFound
from functools import lru_cache

from config import settings
from routers.auth import verify_token

logger = logging.getLogger(__name__)
router = APIRouter()


def get_plex() -> PlexServer:
    try:
        return PlexServer(settings.PLEX_URL, settings.PLEX_TOKEN)
    except Unauthorized:
        raise HTTPException(status_code=503, detail="Plex authentication failed - check PLEX_TOKEN")
    except Exception as e:
        logger.error(f"Plex connection failed: {e}")
        raise HTTPException(status_code=503, detail="Cannot connect to Plex server")


def get_music_library(plex: PlexServer = None):
    if plex is None:
        plex = get_plex()
    try:
        return plex.library.section(settings.PLEX_MUSIC_LIBRARY)
    except NotFound:
        raise HTTPException(status_code=404, detail=f"Library '{settings.PLEX_MUSIC_LIBRARY}' not found")


@router.get("/status")
async def plex_status(_: str = Depends(verify_token)):
    """Check Plex connection status."""
    plex = get_plex()
    return {
        "connected": True,
        "server_name": plex.friendlyName,
        "version": plex.version,
    }


@router.get("/artists")
async def get_artists(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None, max_length=100),
    _: str = Depends(verify_token),
):
    """Get all artists from music library."""
    music = get_music_library()
    if search:
        artists = music.searchArtists(title=search)
    else:
        artists = music.all(libtype="artist")

    total = len(artists)
    page = artists[offset : offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "artists": [
            {
                "id": a.ratingKey,
                "title": a.title,
                "genres": [g.tag for g in (a.genres or [])],
                "thumb": a.thumb,
                "similar": [s.tag for s in (a.similar or [])],
                "country": [c.tag for c in (a.countries or [])],
                "summary": a.summary or "",
            }
            for a in page
        ],
    }


@router.get("/artists/{artist_id}")
async def get_artist(artist_id: int, _: str = Depends(verify_token)):
    """Get artist details with albums."""
    music = get_music_library()
    try:
        artist = music.fetchItem(artist_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Artist not found")

    albums = artist.albums()
    return {
        "id": artist.ratingKey,
        "title": artist.title,
        "genres": [g.tag for g in (artist.genres or [])],
        "similar": [s.tag for s in (artist.similar or [])],
        "summary": artist.summary or "",
        "thumb": artist.thumb,
        "albums": [
            {
                "id": a.ratingKey,
                "title": a.title,
                "year": a.year,
                "thumb": a.thumb,
                "trackCount": len(a.tracks()),
            }
            for a in albums
        ],
    }


@router.get("/tracks")
async def get_tracks(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    genre: Optional[str] = Query(None, max_length=100),
    artist: Optional[str] = Query(None, max_length=200),
    _: str = Depends(verify_token),
):
    """Get tracks with optional filtering."""
    music = get_music_library()
    filters = {}
    if genre:
        filters["genre"] = genre
    if artist:
        filters["artist.title"] = artist

    tracks = music.searchTracks(**filters) if filters else music.all(libtype="track")
    total = len(tracks)
    page = tracks[offset : offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "tracks": [_serialize_track(t) for t in page],
    }


@router.get("/genres")
async def get_genres(_: str = Depends(verify_token)):
    """Get all genres in library."""
    music = get_music_library()
    genres = set()
    for artist in music.all(libtype="artist"):
        for g in (artist.genres or []):
            genres.add(g.tag)
    return {"genres": sorted(list(genres))}


@router.get("/playlists")
async def get_playlists(_: str = Depends(verify_token)):
    """Get existing playlists."""
    plex = get_plex()
    playlists = plex.playlists()
    return {
        "playlists": [
            {
                "id": p.ratingKey,
                "title": p.title,
                "duration": p.duration,
                "trackCount": p.leafCount,
                "thumb": p.thumb,
            }
            for p in playlists
            if p.playlistType == "audio"
        ]
    }


def _serialize_track(t):
    return {
        "id": t.ratingKey,
        "title": t.title,
        "artist": t.grandparentTitle,
        "album": t.parentTitle,
        "duration": t.duration,
        "year": t.year,
        "genres": [g.tag for g in (t.genres or [])],
        "thumb": t.thumb,
    }
