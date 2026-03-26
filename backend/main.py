"""
PlexHarmony - Backend API
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routers import (
    auth, plex, playlists, discovery,
    beets, musicbrainz, picard,
    lidarr, qbittorrent, deluge, sabnzbd,
    ai_playlists, settings_router,
)
from middleware import SecurityMiddleware
from static_serve import mount_static
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("PlexHarmony starting up...")
    yield
    logger.info("PlexHarmony shutting down...")


app = FastAPI(
    title="PlexHarmony",
    version="0.5.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
if settings.ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# Core
app.include_router(auth.router,           prefix="/api/auth",        tags=["auth"])
app.include_router(plex.router,           prefix="/api/plex",        tags=["plex"])
app.include_router(playlists.router,      prefix="/api/playlists",   tags=["playlists"])
app.include_router(discovery.router,      prefix="/api/discovery",   tags=["discovery"])
app.include_router(settings_router.router,prefix="/api/settings",    tags=["settings"])

# Tagging tools
app.include_router(beets.router,          prefix="/api/beets",       tags=["beets"])
app.include_router(musicbrainz.router,    prefix="/api/musicbrainz", tags=["musicbrainz"])
app.include_router(picard.router,         prefix="/api/picard",      tags=["picard"])

# Acquisition pipeline
app.include_router(lidarr.router,         prefix="/api/lidarr",      tags=["lidarr"])
app.include_router(qbittorrent.router,    prefix="/api/qbittorrent", tags=["qbittorrent"])
app.include_router(deluge.router,         prefix="/api/deluge",      tags=["deluge"])
app.include_router(sabnzbd.router,        prefix="/api/sabnzbd",     tags=["sabnzbd"])

# AI
app.include_router(ai_playlists.router,   prefix="/api/ai",          tags=["ai"])


@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": "0.5.0"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


mount_static(app)
