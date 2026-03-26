"""
Beets router - interact with a self-hosted beets music library manager
Beets exposes a REST API via the `beets-web` plugin (port 8337 by default)
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

BEETS_TIMEOUT = 15


def beets_url() -> str:
    if not settings.BEETS_URL:
        raise HTTPException(
            status_code=503,
            detail="Beets is not configured. Set BEETS_URL in your .env (e.g. http://192.168.1.x:8337)",
        )
    return settings.BEETS_URL.rstrip("/")


class BeetsTagRequest(BaseModel):
    """Request to re-tag items via beets."""
    item_ids: list[int] = Field(..., min_length=1, max_length=200)
    write: bool = Field(True, description="Write tags to files on disk")


class BeetsImportRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=500, description="Path to music directory to import")
    copy: bool = True
    move: bool = False
    write: bool = True
    autotag: bool = True


@router.get("/status")
async def beets_status(_: str = Depends(verify_token)):
    """Check connection to beets web plugin."""
    async with httpx.AsyncClient(timeout=BEETS_TIMEOUT) as client:
        try:
            resp = await client.get(f"{beets_url()}/stats")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Beets returned an error")
            data = resp.json()
            return {"connected": True, "stats": data}
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to beets. Is the beets web plugin running?")


@router.get("/items")
async def beets_items(
    search: Optional[str] = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=500),
    _: str = Depends(verify_token),
):
    """Search beets library items."""
    async with httpx.AsyncClient(timeout=BEETS_TIMEOUT) as client:
        url = f"{beets_url()}/item/query"
        params = {}
        if search:
            url = f"{beets_url()}/item/query/{search}"
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Beets query failed")
        data = resp.json()
        items = data.get("results", [])[:limit]
        return {
            "total": len(items),
            "items": [_serialize_item(i) for i in items],
        }


@router.get("/items/{item_id}")
async def beets_item(item_id: int, _: str = Depends(verify_token)):
    """Get a single beets item."""
    async with httpx.AsyncClient(timeout=BEETS_TIMEOUT) as client:
        resp = await client.get(f"{beets_url()}/item/{item_id}")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Item not found in beets")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Beets error")
        return resp.json()


@router.patch("/items/{item_id}")
async def update_beets_item(
    item_id: int,
    tags: dict,
    _: str = Depends(verify_token),
):
    """
    Update tags on a beets item.
    Pass a dict of field->value pairs to update, e.g. {"genre": "Jazz", "year": 2001}
    Beets will write these to the file if the write plugin is enabled.
    """
    # Only allow safe tag fields — no path manipulation
    allowed_fields = {
        "title", "artist", "album", "albumartist", "genre", "year",
        "track", "tracktotal", "disc", "disctotal", "label", "mb_trackid",
        "mb_albumid", "mb_artistid", "mb_albumartistid", "comp",
        "comments", "bpm", "lyrics",
    }
    filtered = {k: v for k, v in tags.items() if k in allowed_fields}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid tag fields provided")

    async with httpx.AsyncClient(timeout=BEETS_TIMEOUT) as client:
        resp = await client.patch(
            f"{beets_url()}/item/{item_id}",
            json=filtered,
        )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Item not found in beets")
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Beets update failed: {resp.text}")
        return {"updated": True, "item_id": item_id, "fields": filtered}


@router.get("/albums")
async def beets_albums(
    search: Optional[str] = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=500),
    _: str = Depends(verify_token),
):
    """Search beets albums."""
    async with httpx.AsyncClient(timeout=BEETS_TIMEOUT) as client:
        url = f"{beets_url()}/album/query/{search}" if search else f"{beets_url()}/album/query"
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Beets album query failed")
        data = resp.json()
        albums = data.get("results", [])[:limit]
        return {"total": len(albums), "albums": albums}


@router.post("/write-tags")
async def beets_write_tags(
    body: BeetsTagRequest,
    _: str = Depends(verify_token),
):
    """
    Trigger beets to re-write tags to disk for specific item IDs.
    This calls the beets `modify` command via the web API.
    Requires beets web plugin to have write access enabled.
    """
    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for item_id in body.item_ids:
            try:
                resp = await client.patch(
                    f"{beets_url()}/item/{item_id}",
                    json={},  # empty patch triggers a write if beets is configured to auto-write
                )
                results.append({"id": item_id, "success": resp.status_code in (200, 204)})
            except Exception as e:
                results.append({"id": item_id, "success": False, "error": str(e)})
    return {"results": results}


def _serialize_item(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "title": item.get("title"),
        "artist": item.get("artist"),
        "album": item.get("album"),
        "genre": item.get("genre"),
        "year": item.get("year"),
        "track": item.get("track"),
        "mb_trackid": item.get("mb_trackid"),
        "mb_albumid": item.get("mb_albumid"),
        "path": item.get("path"),
    }
