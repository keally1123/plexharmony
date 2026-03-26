"""
Playlist router - generate and push playlists to Plex
Supports duration limits (min/max minutes) and shuffle
"""
import logging
import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from plexapi.server import PlexServer

from config import settings
from routers.auth import verify_token
from routers.plex import get_plex, get_music_library

logger = logging.getLogger(__name__)
router = APIRouter()


class PlaylistCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    mode: str = Field(..., pattern="^(genre|similar_artist|mixed)$")
    genre: Optional[str] = Field(None, max_length=100)
    seed_artist_id: Optional[int] = None
    seed_artist_name: Optional[str] = Field(None, max_length=200)
    max_tracks: int = Field(50, ge=5, le=500)
    # Duration limits in minutes (None = no limit)
    min_duration_minutes: Optional[int] = Field(None, ge=1, le=600)
    max_duration_minutes: Optional[int] = Field(None, ge=1, le=600)
    shuffle: bool = False
    push_to_plex: bool = True


class PlaylistUpdateRequest(BaseModel):
    track_ids: List[int] = Field(..., min_length=1, max_length=500)
    push_to_plex: bool = True


@router.post("/generate")
async def generate_playlist(
    body: PlaylistCreateRequest,
    _: str = Depends(verify_token),
):
    """Generate a playlist by genre or sonic similarity, optionally push to Plex."""
    music = get_music_library()

    if body.mode == "genre":
        if not body.genre:
            raise HTTPException(status_code=400, detail="genre is required for genre mode")
        tracks = music.searchTracks(genre=body.genre)
        description = f"Auto-generated: {body.genre} genre"

    elif body.mode == "similar_artist":
        if not body.seed_artist_id and not body.seed_artist_name:
            raise HTTPException(status_code=400, detail="seed_artist_id or seed_artist_name required")
        tracks, description = await _similar_artist_tracks(music, body.seed_artist_id, body.seed_artist_name)

    elif body.mode == "mixed":
        genre_tracks = music.searchTracks(genre=body.genre) if body.genre else []
        if body.seed_artist_id or body.seed_artist_name:
            similar_tracks, _ = await _similar_artist_tracks(music, body.seed_artist_id, body.seed_artist_name)
        else:
            similar_tracks = []
        seen = set()
        tracks = []
        for t in genre_tracks + similar_tracks:
            if t.ratingKey not in seen:
                seen.add(t.ratingKey)
                tracks.append(t)
        description = f"Mixed playlist: genre={body.genre}"
    else:
        raise HTTPException(status_code=400, detail="Invalid mode")

    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found matching criteria")

    # Optional shuffle before selection
    if body.shuffle:
        tracks = list(tracks)
        random.shuffle(tracks)

    # Apply duration-aware selection
    selected = _select_by_duration(
        tracks,
        max_tracks=body.max_tracks,
        min_minutes=body.min_duration_minutes,
        max_minutes=body.max_duration_minutes,
    )

    if not selected:
        raise HTTPException(
            status_code=404,
            detail="No tracks matched the duration constraints. Try relaxing the min/max duration limits.",
        )

    total_ms = sum(t.duration or 0 for t in selected)
    total_minutes = round(total_ms / 60000, 1)

    preview = [
        {
            "id": t.ratingKey,
            "title": t.title,
            "artist": t.grandparentTitle,
            "album": t.parentTitle,
            "duration": t.duration,
        }
        for t in selected
    ]

    playlist_id = None
    if body.push_to_plex:
        plex = get_plex()
        try:
            playlist = plex.createPlaylist(body.name, items=selected)
            playlist_id = playlist.ratingKey
            logger.info(f"Created Plex playlist '{body.name}' with {len(selected)} tracks ({total_minutes}m)")
        except Exception as e:
            logger.error(f"Failed to create Plex playlist: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create playlist in Plex: {str(e)}")

    return {
        "name": body.name,
        "track_count": len(selected),
        "total_minutes": total_minutes,
        "description": description,
        "plex_playlist_id": playlist_id,
        "tracks": preview,
    }


@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: int, _: str = Depends(verify_token)):
    """Delete a playlist from Plex."""
    plex = get_plex()
    try:
        playlist = plex.fetchItem(playlist_id)
        playlist.delete()
        return {"deleted": True, "id": playlist_id}
    except Exception:
        raise HTTPException(status_code=404, detail="Playlist not found")


@router.post("/{playlist_id}/tracks")
async def add_tracks_to_playlist(
    playlist_id: int,
    body: PlaylistUpdateRequest,
    _: str = Depends(verify_token),
):
    """Add tracks to an existing Plex playlist."""
    plex = get_plex()
    music = get_music_library()
    try:
        playlist = plex.fetchItem(playlist_id)
        tracks = [music.fetchItem(tid) for tid in body.track_ids]
        playlist.addItems(tracks)
        return {"added": len(tracks), "playlist_id": playlist_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _select_by_duration(tracks, max_tracks: int, min_minutes: Optional[int], max_minutes: Optional[int]):
    """
    Select tracks respecting max_tracks and duration constraints.
    - If only max_duration is set: stop adding when total would exceed it.
    - If only min_duration is set: keep adding until we hit the minimum (up to max_tracks).
    - If both are set: build a playlist between min and max duration.
    """
    if min_minutes is None and max_minutes is None:
        return tracks[:max_tracks]

    max_ms = (max_minutes * 60 * 1000) if max_minutes else None
    min_ms = (min_minutes * 60 * 1000) if min_minutes else None

    selected = []
    total_ms = 0

    for track in tracks:
        if len(selected) >= max_tracks:
            break
        dur = track.duration or 0
        # Would adding this track exceed max duration?
        if max_ms and (total_ms + dur) > max_ms:
            # If we haven't met minimum yet, try to keep going with shorter tracks
            if min_ms and total_ms < min_ms:
                continue
            # Otherwise stop
            break
        selected.append(track)
        total_ms += dur

    # Check minimum was met
    if min_ms and total_ms < min_ms:
        logger.warning(f"Playlist total {total_ms/60000:.1f}m is below minimum {min_minutes}m — returning what we have")

    return selected


async def _similar_artist_tracks(music, seed_id: Optional[int], seed_name: Optional[str]):
    """Find tracks from artists similar to the seed artist."""
    try:
        if seed_id:
            seed = music.fetchItem(seed_id)
        else:
            results = music.searchArtists(title=seed_name)
            if not results:
                raise HTTPException(status_code=404, detail=f"Artist '{seed_name}' not found in library")
            seed = results[0]

        similar_names = {s.tag.lower() for s in (seed.similar or [])}
        similar_names.add(seed.title.lower())

        tracks = []
        for artist in music.all(libtype="artist"):
            if artist.title.lower() in similar_names:
                tracks.extend(artist.tracks())

        description = f"Similar to {seed.title}"
        return tracks, description
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding similar artists: {e}")
        return [], "Similar artists"
