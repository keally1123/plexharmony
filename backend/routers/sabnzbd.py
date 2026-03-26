"""
SABnzbd router - Usenet download client integration
Passes NZB URLs/files to SABnzbd. SABnzbd handles all downloading.
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


def sabnzbd_base():
    if not settings.SABNZBD_URL:
        raise HTTPException(status_code=503, detail="SABnzbd URL not configured.")
    return settings.SABNZBD_URL.rstrip("/")


def sabnzbd_key():
    if not settings.SABNZBD_API_KEY:
        raise HTTPException(status_code=503, detail="SABnzbd API key not configured.")
    return settings.SABNZBD_API_KEY


async def sab_get(params: dict) -> dict:
    p = {"apikey": sabnzbd_key(), "output": "json", **params}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            r = await client.get(f"{sabnzbd_base()}/api", params=p)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"SABnzbd error: {r.status_code}")
            data = r.json()
            if data.get("status") is False:
                raise HTTPException(status_code=502, detail=data.get("error", "SABnzbd error"))
            return data
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to SABnzbd. Check SABNZBD_URL.")


@router.get("/status")
async def sab_status(_: str = Depends(verify_token)):
    if not settings.SABNZBD_URL or not settings.SABNZBD_API_KEY:
        return {"configured": False}
    try:
        data = await sab_get({"mode": "version"})
        return {"configured": True, "connected": True, "version": data.get("version"), "url": settings.SABNZBD_URL}
    except HTTPException as e:
        return {"configured": True, "connected": False, "error": e.detail}


@router.get("/queue")
async def get_queue(_: str = Depends(verify_token)):
    """Get SABnzbd download queue."""
    data = await sab_get({"mode": "queue"})
    q = data.get("queue", {})
    return {
        "status": q.get("status"),
        "speed": q.get("speed"),
        "size_left": q.get("sizeleft"),
        "time_left": q.get("timeleft"),
        "paused": q.get("paused"),
        "items": [
            {
                "nzo_id": item.get("nzo_id"),
                "filename": item.get("filename"),
                "status": item.get("status"),
                "percentage": item.get("percentage"),
                "size": item.get("size"),
                "sizeleft": item.get("sizeleft"),
                "timeleft": item.get("timeleft"),
                "category": item.get("cat"),
            }
            for item in q.get("slots", [])
        ],
    }


@router.get("/history")
async def get_history(
    limit: int = Query(20, ge=1, le=100),
    _: str = Depends(verify_token),
):
    """Get SABnzbd download history."""
    data = await sab_get({"mode": "history", "limit": limit})
    h = data.get("history", {})
    return {
        "total": h.get("noofslots", 0),
        "items": [
            {
                "nzo_id": item.get("nzo_id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "size": item.get("size"),
                "download_time": item.get("download_time"),
                "completed": item.get("completed"),
                "category": item.get("category"),
                "storage": item.get("storage"),
            }
            for item in h.get("slots", [])
        ],
    }


class AddNzbRequest(BaseModel):
    url: str = Field(..., min_length=5, description="NZB file URL")
    name: Optional[str] = Field(None, max_length=300)
    category: Optional[str] = Field(None, max_length=100)
    priority: int = Field(0, ge=-2, le=2)
    paused: bool = False


@router.post("/add")
async def add_nzb(body: AddNzbRequest, _: str = Depends(verify_token)):
    """Add an NZB by URL to SABnzbd."""
    params = {
        "mode": "addurl",
        "name": body.url,
        "priority": body.priority,
        "pause": 1 if body.paused else 0,
    }
    if body.name:
        params["nzbname"] = body.name
    if body.category:
        params["cat"] = body.category
    data = await sab_get(params)
    ids = data.get("nzo_ids", [])
    logger.info(f"Added NZB to SABnzbd: {ids}")
    return {"added": True, "nzo_ids": ids}


@router.post("/pause")
async def pause_queue(_: str = Depends(verify_token)):
    await sab_get({"mode": "pause"})
    return {"paused": True}


@router.post("/resume")
async def resume_queue(_: str = Depends(verify_token)):
    await sab_get({"mode": "resume"})
    return {"resumed": True}


@router.delete("/queue/{nzo_id}")
async def delete_from_queue(nzo_id: str, _: str = Depends(verify_token)):
    await sab_get({"mode": "queue", "name": "delete", "value": nzo_id})
    return {"deleted": True}
