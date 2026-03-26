"""
Discovery router - suggest similar artists and songs NOT in your library
Uses Last.fm API (free) for recommendations
"""
import logging
import httpx
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
from routers.auth import verify_token
from routers.plex import get_music_library

logger = logging.getLogger(__name__)
router = APIRouter()

LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"


async def lastfm_get(method: str, params: dict) -> dict:
    """Make a Last.fm API request."""
    if not settings.LASTFM_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Last.fm API key not configured. Set LASTFM_API_KEY in your .env file.",
        )
    params.update({
        "method": method,
        "api_key": settings.LASTFM_API_KEY,
        "format": "json",
    })
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(LASTFM_BASE, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Last.fm API error")
        data = resp.json()
        if "error" in data:
            raise HTTPException(status_code=404, detail=data.get("message", "Last.fm error"))
        return data


def get_library_artist_names() -> set:
    """Get set of artist names in Plex library (lowercase)."""
    try:
        music = get_music_library()
        return {a.title.lower() for a in music.all(libtype="artist")}
    except Exception:
        return set()


@router.get("/similar-artists")
async def get_similar_artists(
    artist: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=30),
    include_in_library: bool = Query(False),
    _: str = Depends(verify_token),
):
    """
    Get artists similar to the given artist.
    By default, only returns artists NOT in your library (new discoveries).
    """
    data = await lastfm_get("artist.getSimilar", {"artist": artist, "limit": 50})
    similar = data.get("similarartists", {}).get("artist", [])

    library_artists = get_library_artist_names() if not include_in_library else set()

    results = []
    for a in similar:
        name = a.get("name", "")
        in_library = name.lower() in library_artists
        if not include_in_library and in_library:
            continue
        results.append({
            "name": name,
            "match_score": float(a.get("match", 0)),
            "url": a.get("url"),
            "image": next(
                (img["#text"] for img in a.get("image", []) if img.get("size") == "large"),
                None,
            ),
            "in_library": in_library,
        })
        if len(results) >= limit:
            break

    return {
        "seed_artist": artist,
        "suggestions": results,
        "total": len(results),
    }


@router.get("/similar-tracks")
async def get_similar_tracks(
    artist: str = Query(..., min_length=1, max_length=200),
    track: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=30),
    _: str = Depends(verify_token),
):
    """Get tracks similar to a given track."""
    data = await lastfm_get("track.getSimilar", {"artist": artist, "track": track, "limit": limit})
    similar = data.get("similartracks", {}).get("track", [])

    library_artists = get_library_artist_names()

    return {
        "seed": {"artist": artist, "track": track},
        "suggestions": [
            {
                "title": t.get("name"),
                "artist": t.get("artist", {}).get("name"),
                "duration": t.get("duration"),
                "url": t.get("url"),
                "match_score": float(t.get("match", 0)),
                "in_library": t.get("artist", {}).get("name", "").lower() in library_artists,
            }
            for t in similar
        ],
    }


@router.get("/artist-info")
async def get_artist_info(
    artist: str = Query(..., min_length=1, max_length=200),
    _: str = Depends(verify_token),
):
    """Get bio, tags, and stats for an artist."""
    data = await lastfm_get("artist.getInfo", {"artist": artist})
    info = data.get("artist", {})
    tags = [t["name"] for t in info.get("tags", {}).get("tag", [])]
    bio = info.get("bio", {}).get("summary", "")
    # Strip Last.fm HTML link at end of bio
    if "<a href=" in bio:
        bio = bio[: bio.rfind("<a href=")].strip()

    return {
        "name": info.get("name"),
        "listeners": info.get("stats", {}).get("listeners"),
        "playcount": info.get("stats", {}).get("playcount"),
        "tags": tags,
        "bio": bio,
        "url": info.get("url"),
        "image": next(
            (img["#text"] for img in info.get("image", []) if img.get("size") == "large"),
            None,
        ),
    }


@router.get("/top-tracks")
async def get_artist_top_tracks(
    artist: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=20),
    _: str = Depends(verify_token),
):
    """Get top tracks for an artist."""
    data = await lastfm_get("artist.getTopTracks", {"artist": artist, "limit": limit})
    tracks = data.get("toptracks", {}).get("track", [])
    library_artists = get_library_artist_names()

    return {
        "artist": artist,
        "tracks": [
            {
                "title": t.get("name"),
                "playcount": t.get("playcount"),
                "listeners": t.get("listeners"),
                "url": t.get("url"),
                "in_library": artist.lower() in library_artists,
            }
            for t in tracks
        ],
    }


@router.get("/genre-artists")
async def get_genre_artists(
    genre: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    _: str = Depends(verify_token),
):
    """Get top artists for a genre (tag) from Last.fm."""
    data = await lastfm_get("tag.getTopArtists", {"tag": genre, "limit": limit})
    artists = data.get("topartists", {}).get("artist", [])
    library_artists = get_library_artist_names()

    return {
        "genre": genre,
        "artists": [
            {
                "name": a.get("name"),
                "url": a.get("url"),
                "in_library": a.get("name", "").lower() in library_artists,
            }
            for a in artists
        ],
    }
