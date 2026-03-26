"""
Lidarr router - music library manager integration
Passes artist/album info to Lidarr for monitoring and searching.
Lidarr handles all acquisition through its own configured indexers.
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
TIMEOUT = 15


def lidarr_headers():
    if not settings.LIDARR_API_KEY:
        raise HTTPException(status_code=503, detail="Lidarr API key not configured. Set LIDARR_API_KEY in settings.")
    return {"X-Api-Key": settings.LIDARR_API_KEY, "Content-Type": "application/json"}


def lidarr_url(path: str) -> str:
    if not settings.LIDARR_URL:
        raise HTTPException(status_code=503, detail="Lidarr URL not configured. Set LIDARR_URL in settings.")
    base = settings.LIDARR_URL.rstrip("/")
    return f"{base}/api/v1/{path.lstrip('/')}"


async def lidarr_get(path: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            r = await client.get(lidarr_url(path), headers=lidarr_headers(), params=params or {})
            if r.status_code == 401:
                raise HTTPException(status_code=401, detail="Lidarr API key invalid")
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Lidarr error: {r.status_code}")
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Lidarr. Check LIDARR_URL.")


async def lidarr_post(path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            r = await client.post(lidarr_url(path), headers=lidarr_headers(), json=body)
            if r.status_code == 401:
                raise HTTPException(status_code=401, detail="Lidarr API key invalid")
            if r.status_code not in (200, 201):
                raise HTTPException(status_code=502, detail=f"Lidarr error {r.status_code}: {r.text[:200]}")
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Lidarr.")


@router.get("/status")
async def lidarr_status(_: str = Depends(verify_token)):
    if not settings.LIDARR_URL or not settings.LIDARR_API_KEY:
        return {"configured": False}
    try:
        data = await lidarr_get("system/status")
        return {"configured": True, "connected": True, "version": data.get("version"), "url": settings.LIDARR_URL}
    except HTTPException as e:
        return {"configured": True, "connected": False, "error": e.detail}


@router.get("/artists")
async def get_artists(_: str = Depends(verify_token)):
    """Get all monitored artists in Lidarr."""
    data = await lidarr_get("artist")
    return {
        "artists": [
            {
                "id": a.get("id"),
                "name": a.get("artistName"),
                "monitored": a.get("monitored"),
                "status": a.get("status"),
                "albumCount": a.get("statistics", {}).get("albumCount", 0),
                "trackCount": a.get("statistics", {}).get("trackCount", 0),
                "genres": a.get("genres", []),
                "mbid": a.get("foreignArtistId"),
            }
            for a in data
        ]
    }


@router.get("/wanted")
async def get_wanted(_: str = Depends(verify_token)):
    """Get wanted/missing albums."""
    data = await lidarr_get("wanted/missing", {"pageSize": 50, "sortKey": "artists.sortName"})
    return {
        "total": data.get("totalRecords", 0),
        "albums": [
            {
                "id": a.get("id"),
                "title": a.get("title"),
                "artist": a.get("artist", {}).get("artistName"),
                "releaseDate": a.get("releaseDate"),
                "monitored": a.get("monitored"),
            }
            for a in data.get("records", [])
        ],
    }


class AddArtistRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    mbid: Optional[str] = None
    monitored: bool = True
    quality_profile_id: int = 1
    metadata_profile_id: int = 1
    root_folder: Optional[str] = None


@router.post("/artists/add")
async def add_artist(body: AddArtistRequest, _: str = Depends(verify_token)):
    """
    Add an artist to Lidarr for monitoring.
    Lidarr will then search for and acquire their music
    through its own configured indexers and download clients.
    """
    # First look up the artist in Lidarr's search
    search = await lidarr_get("artist/lookup", {"term": body.name})
    if not search:
        raise HTTPException(status_code=404, detail=f"Artist '{body.name}' not found in Lidarr lookup")

    candidate = search[0]
    if body.mbid:
        for r in search:
            if r.get("foreignArtistId") == body.mbid:
                candidate = r
                break

    # Determine root folder
    root_folder = body.root_folder or settings.LIDARR_ROOT_FOLDER
    if not root_folder:
        folders = await lidarr_get("rootfolder")
        root_folder = folders[0].get("path") if folders else "/music"

    payload = {
        **candidate,
        "monitored": body.monitored,
        "qualityProfileId": body.quality_profile_id,
        "metadataProfileId": body.metadata_profile_id,
        "rootFolderPath": root_folder,
        "addOptions": {"monitor": "all", "searchForMissingAlbums": True},
    }

    result = await lidarr_post("artist", payload)
    logger.info(f"Added artist '{body.name}' to Lidarr (id={result.get('id')})")
    return {"added": True, "artist": result.get("artistName"), "id": result.get("id")}


@router.post("/artists/{artist_id}/search")
async def search_artist(artist_id: int, _: str = Depends(verify_token)):
    """Tell Lidarr to search for all missing albums for an artist."""
    result = await lidarr_post("command", {"name": "ArtistSearch", "artistId": artist_id})
    return {"queued": True, "command_id": result.get("id")}


@router.get("/queue")
async def get_queue(_: str = Depends(verify_token)):
    """Get Lidarr download queue."""
    data = await lidarr_get("queue")
    return {
        "total": data.get("totalRecords", 0),
        "items": [
            {
                "id": i.get("id"),
                "title": i.get("title"),
                "artist": i.get("artist", {}).get("artistName"),
                "status": i.get("status"),
                "trackedDownloadStatus": i.get("trackedDownloadStatus"),
                "sizeleft": i.get("sizeleft"),
                "timeleft": i.get("timeleft"),
            }
            for i in data.get("records", [])
        ],
    }


@router.get("/lookup")
async def lookup_artist(
    term: str = Query(..., min_length=1, max_length=200),
    _: str = Depends(verify_token),
):
    """Search Lidarr's artist lookup (MusicBrainz backed)."""
    data = await lidarr_get("artist/lookup", {"term": term})
    return {
        "results": [
            {
                "name": a.get("artistName"),
                "mbid": a.get("foreignArtistId"),
                "genres": a.get("genres", []),
                "overview": (a.get("overview") or "")[:300],
                "images": [i.get("url") for i in a.get("images", [])[:1]],
            }
            for a in data[:10]
        ]
    }
