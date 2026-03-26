"""
qBittorrent router - torrent client integration
Passes torrent URLs/magnets to qBittorrent. qBittorrent handles all downloading.
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

_qbit_cookie: Optional[str] = None


async def qbit_login() -> str:
    """Login to qBittorrent and return session cookie."""
    global _qbit_cookie
    if not settings.QBIT_URL:
        raise HTTPException(status_code=503, detail="qBittorrent URL not configured.")
    base = settings.QBIT_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            r = await client.post(
                f"{base}/api/v2/auth/login",
                data={"username": settings.QBIT_USERNAME or "admin", "password": settings.QBIT_PASSWORD or ""},
            )
            if r.text == "Fails.":
                raise HTTPException(status_code=401, detail="qBittorrent login failed — check username/password")
            cookie = r.cookies.get("SID")
            if not cookie:
                raise HTTPException(status_code=401, detail="qBittorrent did not return a session cookie")
            _qbit_cookie = cookie
            return cookie
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to qBittorrent. Check QBIT_URL.")


async def qbit_get(path: str, params: dict = None):
    cookie = _qbit_cookie or await qbit_login()
    base = settings.QBIT_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=TIMEOUT, cookies={"SID": cookie}) as client:
        r = await client.get(f"{base}/api/v2/{path}", params=params or {})
        if r.status_code == 403:
            # Session expired — re-login once
            cookie = await qbit_login()
            async with httpx.AsyncClient(timeout=TIMEOUT, cookies={"SID": cookie}) as c2:
                r = await c2.get(f"{base}/api/v2/{path}", params=params or {})
        return r


async def qbit_post(path: str, data: dict = None, files=None):
    cookie = _qbit_cookie or await qbit_login()
    base = settings.QBIT_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=TIMEOUT, cookies={"SID": cookie}) as client:
        r = await client.post(f"{base}/api/v2/{path}", data=data or {}, files=files)
        if r.status_code == 403:
            cookie = await qbit_login()
            async with httpx.AsyncClient(timeout=TIMEOUT, cookies={"SID": cookie}) as c2:
                r = await c2.post(f"{base}/api/v2/{path}", data=data or {}, files=files)
        return r


@router.get("/status")
async def qbit_status(_: str = Depends(verify_token)):
    if not settings.QBIT_URL:
        return {"configured": False}
    try:
        r = await qbit_get("app/version")
        return {"configured": True, "connected": True, "version": r.text, "url": settings.QBIT_URL}
    except HTTPException as e:
        return {"configured": True, "connected": False, "error": e.detail}


@router.get("/torrents")
async def list_torrents(
    filter: str = Query("all", pattern="^(all|downloading|seeding|completed|paused|active|inactive)$"),
    _: str = Depends(verify_token),
):
    """List torrents with optional status filter."""
    r = await qbit_get("torrents/info", {"filter": filter})
    torrents = r.json() if r.status_code == 200 else []
    return {
        "torrents": [
            {
                "hash": t.get("hash"),
                "name": t.get("name"),
                "state": t.get("state"),
                "progress": round(t.get("progress", 0) * 100, 1),
                "size": t.get("size"),
                "dlspeed": t.get("dlspeed"),
                "upspeed": t.get("upspeed"),
                "eta": t.get("eta"),
                "category": t.get("category"),
                "save_path": t.get("save_path"),
            }
            for t in torrents
        ]
    }


class AddTorrentRequest(BaseModel):
    urls: Optional[str] = Field(None, description="Newline-separated magnet links or torrent URLs")
    save_path: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=100)
    paused: bool = False


@router.post("/add")
async def add_torrent(body: AddTorrentRequest, _: str = Depends(verify_token)):
    """Add a torrent by magnet link or URL to qBittorrent."""
    if not body.urls:
        raise HTTPException(status_code=400, detail="urls is required")
    data = {"urls": body.urls, "paused": str(body.paused).lower()}
    if body.save_path:
        data["savepath"] = body.save_path
    if body.category:
        data["category"] = body.category
    r = await qbit_post("torrents/add", data)
    if r.text == "Ok.":
        logger.info(f"Added torrent to qBittorrent")
        return {"added": True}
    raise HTTPException(status_code=500, detail=f"qBittorrent returned: {r.text}")


@router.post("/pause/{torrent_hash}")
async def pause_torrent(torrent_hash: str, _: str = Depends(verify_token)):
    await qbit_post("torrents/pause", {"hashes": torrent_hash})
    return {"paused": True}


@router.post("/resume/{torrent_hash}")
async def resume_torrent(torrent_hash: str, _: str = Depends(verify_token)):
    await qbit_post("torrents/resume", {"hashes": torrent_hash})
    return {"resumed": True}


@router.delete("/{torrent_hash}")
async def delete_torrent(
    torrent_hash: str,
    delete_files: bool = Query(False),
    _: str = Depends(verify_token),
):
    await qbit_post("torrents/delete", {"hashes": torrent_hash, "deleteFiles": str(delete_files).lower()})
    return {"deleted": True}


@router.get("/categories")
async def get_categories(_: str = Depends(verify_token)):
    r = await qbit_get("torrents/categories")
    return r.json() if r.status_code == 200 else {}
