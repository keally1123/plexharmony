"""
MusicBrainz Picard router
Picard exposes a simple HTTP server on port 8000 (localhost only by default)
when launched with the --server flag or via the Picard scripting plugin.

NOTE: Picard's built-in server only runs on the machine where Picard is open.
For a self-hosted / headless setup, users should run Picard on their NAS or
use beets (which handles auto-tagging headlessly). This integration is best
for triggering Picard on a machine on the same LAN.

Picard server plugin (community): https://github.com/phw/picard-plugins
Built-in server docs: https://picard-docs.musicbrainz.org/en/scripting/
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import httpx

from routers.auth import verify_token
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

PICARD_TIMEOUT = 20


def picard_url() -> str:
    if not settings.PICARD_URL:
        raise HTTPException(
            status_code=503,
            detail="Picard is not configured. Set PICARD_URL in your .env (e.g. http://192.168.1.x:8000)",
        )
    return settings.PICARD_URL.rstrip("/")


class PicardLoadRequest(BaseModel):
    """Ask Picard to load files for tagging."""
    paths: list[str] = Field(..., min_length=1, max_length=50)


class PicardSaveRequest(BaseModel):
    """Ask Picard to save/write tags for currently loaded files."""
    pass


@router.get("/status")
async def picard_status(_: str = Depends(verify_token)):
    """
    Check if Picard's HTTP server is reachable.
    Picard must be running with the server plugin or --server flag.
    """
    if not settings.PICARD_URL:
        return {
            "configured": False,
            "message": "Set PICARD_URL in your .env to enable Picard integration",
        }
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{picard_url()}/")
            return {
                "configured": True,
                "connected": resp.status_code < 500,
                "url": picard_url(),
            }
        except httpx.ConnectError:
            return {
                "configured": True,
                "connected": False,
                "url": picard_url(),
                "message": "Cannot connect — is Picard running with the server plugin enabled?",
            }


@router.post("/load")
async def picard_load(body: PicardLoadRequest, _: str = Depends(verify_token)):
    """
    Send file paths to Picard for loading and auto-tagging.
    Picard will match the files against MusicBrainz and show results in its UI.
    """
    # Validate paths don't escape expected music dirs
    for path in body.paths:
        if ".." in path or path.startswith("/etc") or path.startswith("/sys"):
            raise HTTPException(status_code=400, detail=f"Invalid path: {path}")

    async with httpx.AsyncClient(timeout=PICARD_TIMEOUT) as client:
        try:
            # Picard's built-in server accepts file paths via POST
            resp = await client.post(
                f"{picard_url()}/load",
                json={"paths": body.paths},
            )
            if resp.status_code not in (200, 201, 204):
                raise HTTPException(status_code=502, detail=f"Picard returned {resp.status_code}")
            return {"loaded": len(body.paths), "paths": body.paths}
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Picard")


@router.post("/save")
async def picard_save(_: str = Depends(verify_token)):
    """
    Tell Picard to save (write) all currently matched files.
    This writes MusicBrainz tags to the files on disk.
    """
    async with httpx.AsyncClient(timeout=PICARD_TIMEOUT) as client:
        try:
            resp = await client.post(f"{picard_url()}/save")
            if resp.status_code not in (200, 201, 204):
                raise HTTPException(status_code=502, detail=f"Picard returned {resp.status_code}")
            return {"saved": True}
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Picard")


@router.post("/cluster")
async def picard_cluster(_: str = Depends(verify_token)):
    """Tell Picard to cluster loaded files."""
    async with httpx.AsyncClient(timeout=PICARD_TIMEOUT) as client:
        try:
            resp = await client.post(f"{picard_url()}/cluster")
            return {"clustered": True}
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Picard")


@router.post("/lookup")
async def picard_lookup(_: str = Depends(verify_token)):
    """Tell Picard to lookup/match all clustered files against MusicBrainz."""
    async with httpx.AsyncClient(timeout=PICARD_TIMEOUT) as client:
        try:
            resp = await client.post(f"{picard_url()}/lookup")
            return {"lookup_triggered": True}
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Picard")
