"""
Deluge router - Deluge torrent client integration via JSON-RPC API
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

_deluge_cookie: Optional[str] = None


async def deluge_rpc(method: str, params: list = None) -> dict:
    """Make a Deluge JSON-RPC call."""
    global _deluge_cookie
    if not settings.DELUGE_URL:
        raise HTTPException(status_code=503, detail="Deluge URL not configured.")
    base = settings.DELUGE_URL.rstrip("/")
    url = f"{base}/json"
    payload = {"method": method, "params": params or [], "id": 1}
    cookies = {"_session_id": _deluge_cookie} if _deluge_cookie else {}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            r = await client.post(url, json=payload, cookies=cookies)
            data = r.json()
            if data.get("error"):
                err = data["error"].get("message", "Unknown Deluge error")
                if "not authenticated" in err.lower():
                    # Re-auth
                    _deluge_cookie = None
                    await _deluge_auth(client, base)
                    r2 = await client.post(url, json=payload, cookies={"_session_id": _deluge_cookie})
                    data = r2.json()
                    if data.get("error"):
                        raise HTTPException(status_code=502, detail=data["error"].get("message"))
                else:
                    raise HTTPException(status_code=502, detail=err)
            return data.get("result")
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Deluge. Check DELUGE_URL.")


async def _deluge_auth(client: httpx.AsyncClient, base: str):
    global _deluge_cookie
    r = await client.post(
        f"{base}/json",
        json={"method": "auth.login", "params": [settings.DELUGE_PASSWORD or ""], "id": 1},
    )
    cookie = r.cookies.get("_session_id")
    if not cookie:
        raise HTTPException(status_code=401, detail="Deluge authentication failed")
    _deluge_cookie = cookie


@router.get("/status")
async def deluge_status(_: str = Depends(verify_token)):
    if not settings.DELUGE_URL:
        return {"configured": False}
    try:
        result = await deluge_rpc("core.get_free_space")
        return {"configured": True, "connected": True, "free_space": result, "url": settings.DELUGE_URL}
    except HTTPException as e:
        return {"configured": True, "connected": False, "error": e.detail}


@router.get("/torrents")
async def list_torrents(_: str = Depends(verify_token)):
    """List all torrents with status."""
    fields = ["name", "state", "progress", "total_size", "download_payload_rate", "upload_payload_rate", "eta", "label", "save_path"]
    result = await deluge_rpc("core.get_torrents_status", [{}, fields])
    torrents = []
    for hash_id, t in (result or {}).items():
        torrents.append({
            "hash": hash_id,
            "name": t.get("name"),
            "state": t.get("state"),
            "progress": round(t.get("progress", 0), 1),
            "size": t.get("total_size"),
            "dlspeed": t.get("download_payload_rate"),
            "upspeed": t.get("upload_payload_rate"),
            "eta": t.get("eta"),
            "label": t.get("label"),
            "save_path": t.get("save_path"),
        })
    return {"torrents": torrents}


class AddTorrentRequest(BaseModel):
    url: str = Field(..., min_length=5)
    save_path: Optional[str] = Field(None, max_length=500)
    paused: bool = False


@router.post("/add")
async def add_torrent(body: AddTorrentRequest, _: str = Depends(verify_token)):
    """Add a torrent by magnet link or URL to Deluge."""
    options = {"add_paused": body.paused}
    if body.save_path:
        options["download_location"] = body.save_path
    if body.url.startswith("magnet:"):
        result = await deluge_rpc("core.add_torrent_magnet", [body.url, options])
    else:
        result = await deluge_rpc("core.add_torrent_url", [body.url, options])
    logger.info(f"Added torrent to Deluge: {result}")
    return {"added": True, "hash": result}


@router.post("/pause/{torrent_hash}")
async def pause_torrent(torrent_hash: str, _: str = Depends(verify_token)):
    await deluge_rpc("core.pause_torrent", [[torrent_hash]])
    return {"paused": True}


@router.post("/resume/{torrent_hash}")
async def resume_torrent(torrent_hash: str, _: str = Depends(verify_token)):
    await deluge_rpc("core.resume_torrent", [[torrent_hash]])
    return {"resumed": True}


@router.delete("/{torrent_hash}")
async def delete_torrent(
    torrent_hash: str,
    delete_files: bool = Query(False),
    _: str = Depends(verify_token),
):
    await deluge_rpc("core.remove_torrent", [torrent_hash, delete_files])
    return {"deleted": True}
