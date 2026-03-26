"""
MusicBrainz router
Supports both the public MusicBrainz API and a self-hosted instance (e.g. MusicBrainz Server
via Docker at http://192.168.1.x:5000)

Self-hosted MusicBrainz: https://github.com/metabrainz/musicbrainz-docker
Public API: https://musicbrainz.org/ws/2/
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import httpx

from routers.auth import verify_token
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

MB_TIMEOUT = 15
MB_HEADERS = {
    "User-Agent": "PlexHarmony/1.0 (https://github.com/your-repo/plexharmony)",
    "Accept": "application/json",
}


def mb_base_url() -> str:
    """Return self-hosted URL if configured, otherwise public MB API."""
    if settings.MUSICBRAINZ_URL:
        return settings.MUSICBRAINZ_URL.rstrip("/") + "/ws/2"
    return "https://musicbrainz.org/ws/2"


async def mb_get(path: str, params: dict = None) -> dict:
    """Make a MusicBrainz API request."""
    url = f"{mb_base_url()}/{path}"
    p = {"fmt": "json", **(params or {})}
    async with httpx.AsyncClient(timeout=MB_TIMEOUT, headers=MB_HEADERS) as client:
        try:
            resp = await client.get(url, params=p)
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to MusicBrainz at {mb_base_url()}. Check MUSICBRAINZ_URL in settings.",
            )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Not found in MusicBrainz")
        if resp.status_code == 503:
            raise HTTPException(status_code=503, detail="MusicBrainz server unavailable")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"MusicBrainz error: {resp.status_code}")
        return resp.json()


@router.get("/status")
async def mb_status(_: str = Depends(verify_token)):
    """Check MusicBrainz connectivity."""
    base = mb_base_url()
    try:
        data = await mb_get("release/f32fab67-77dd-3937-addc-9062e28b5f21")  # known test release
        return {
            "connected": True,
            "using": "self-hosted" if settings.MUSICBRAINZ_URL else "public",
            "base_url": base,
        }
    except HTTPException as e:
        if e.status_code == 503:
            return {"connected": False, "base_url": base, "error": e.detail}
        raise


@router.get("/search/artist")
async def search_artist(
    query: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=25),
    _: str = Depends(verify_token),
):
    """Search MusicBrainz for artists."""
    data = await mb_get("artist", {"query": query, "limit": limit})
    artists = data.get("artists", [])
    return {
        "results": [
            {
                "mbid": a.get("id"),
                "name": a.get("name"),
                "disambiguation": a.get("disambiguation"),
                "country": a.get("country"),
                "score": a.get("score"),
                "tags": [t["name"] for t in a.get("tags", [])],
                "genres": [g["name"] for g in a.get("genres", [])],
            }
            for a in artists
        ]
    }


@router.get("/artist/{mbid}")
async def get_artist(
    mbid: str,
    _: str = Depends(verify_token),
):
    """Get full artist details from MusicBrainz by MBID."""
    data = await mb_get(f"artist/{mbid}", {"inc": "tags+genres+ratings+url-rels"})
    return {
        "mbid": data.get("id"),
        "name": data.get("name"),
        "sort_name": data.get("sort-name"),
        "disambiguation": data.get("disambiguation"),
        "country": data.get("country"),
        "tags": [t["name"] for t in data.get("tags", [])],
        "genres": [g["name"] for g in data.get("genres", [])],
        "rating": data.get("rating", {}).get("value"),
        "urls": [
            {"type": u.get("type"), "url": u.get("url", {}).get("resource")}
            for u in data.get("relations", [])
            if u.get("url")
        ],
    }


@router.get("/search/release")
async def search_release(
    query: str = Query(..., min_length=1, max_length=200),
    artist: Optional[str] = Query(None, max_length=200),
    limit: int = Query(10, ge=1, le=25),
    _: str = Depends(verify_token),
):
    """Search for releases (albums) in MusicBrainz."""
    q = query
    if artist:
        q = f"{query} AND artist:{artist}"
    data = await mb_get("release", {"query": q, "limit": limit})
    releases = data.get("releases", [])
    return {
        "results": [
            {
                "mbid": r.get("id"),
                "title": r.get("title"),
                "date": r.get("date"),
                "country": r.get("country"),
                "status": r.get("status"),
                "score": r.get("score"),
                "artist": r.get("artist-credit", [{}])[0].get("artist", {}).get("name") if r.get("artist-credit") else None,
                "label": r.get("label-info", [{}])[0].get("label", {}).get("name") if r.get("label-info") else None,
            }
            for r in releases
        ]
    }


@router.get("/release/{mbid}")
async def get_release(mbid: str, _: str = Depends(verify_token)):
    """Get full release details including track list and genres."""
    data = await mb_get(f"release/{mbid}", {"inc": "recordings+tags+genres+artist-credits+labels"})
    media = data.get("media", [])
    tracks = []
    for medium in media:
        for t in medium.get("tracks", []):
            rec = t.get("recording", {})
            tracks.append({
                "number": t.get("number"),
                "title": t.get("title") or rec.get("title"),
                "length": rec.get("length"),
                "mbid": rec.get("id"),
                "tags": [x["name"] for x in rec.get("tags", [])],
            })
    return {
        "mbid": data.get("id"),
        "title": data.get("title"),
        "date": data.get("date"),
        "country": data.get("country"),
        "status": data.get("status"),
        "genres": [g["name"] for g in data.get("genres", [])],
        "tags": [t["name"] for t in data.get("tags", [])],
        "tracks": tracks,
        "track_count": data.get("track-count"),
    }


@router.get("/recording/{mbid}")
async def get_recording(mbid: str, _: str = Depends(verify_token)):
    """Get recording details by MBID."""
    data = await mb_get(f"recording/{mbid}", {"inc": "tags+genres+artist-credits+releases"})
    return {
        "mbid": data.get("id"),
        "title": data.get("title"),
        "length": data.get("length"),
        "genres": [g["name"] for g in data.get("genres", [])],
        "tags": [t["name"] for t in data.get("tags", [])],
        "artists": [
            ac.get("artist", {}).get("name")
            for ac in data.get("artist-credit", [])
            if isinstance(ac, dict)
        ],
        "releases": [
            {"title": r.get("title"), "mbid": r.get("id"), "date": r.get("date")}
            for r in data.get("releases", [])[:5]
        ],
    }


@router.get("/lookup")
async def lookup_by_isrc(
    isrc: str = Query(..., min_length=10, max_length=15),
    _: str = Depends(verify_token),
):
    """Look up a recording by ISRC code."""
    data = await mb_get("isrc/" + isrc, {"inc": "recordings"})
    return data
