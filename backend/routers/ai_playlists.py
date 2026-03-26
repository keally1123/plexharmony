"""
AI Playlist router
Uses the configured AI provider to interpret natural language playlist requests
and translate them into playlist parameters, then executes against Plex.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from routers.auth import verify_token
from routers.plex import get_plex, get_music_library
from routers.settings_router import load_settings
from services.ai_provider import get_provider, build_playlist_prompt, build_discovery_prompt

logger = logging.getLogger(__name__)
router = APIRouter()


class AIPlaylistRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1000)
    push_to_plex: bool = True
    max_tracks: int = Field(50, ge=5, le=500)


class AIDiscoveryRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)


def get_ai_or_raise():
    user_settings = load_settings()
    ai_cfg = user_settings.get("ai", {})
    provider = get_provider(ai_cfg)
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail="AI is not enabled or configured. Go to Settings → AI Provider to set it up.",
        )
    return provider


@router.get("/status")
async def ai_status(_: str = Depends(verify_token)):
    """Check AI provider status."""
    user_settings = load_settings()
    ai_cfg = user_settings.get("ai", {})
    if not ai_cfg.get("enabled"):
        return {"enabled": False, "provider": "none"}
    provider = get_provider(ai_cfg)
    if provider is None:
        return {"enabled": True, "provider": ai_cfg.get("provider"), "configured": False}
    result = await provider.test()
    return {
        "enabled": True,
        "provider": ai_cfg.get("provider"),
        "configured": True,
        "test": result,
    }


@router.post("/playlist")
async def ai_generate_playlist(
    body: AIPlaylistRequest,
    _: str = Depends(verify_token),
):
    """
    Generate a playlist from a natural language prompt using AI.
    The AI interprets the request and returns playlist parameters,
    which are then executed against the Plex library.
    """
    provider = get_ai_or_raise()
    music = get_music_library()

    # Build library context for the AI
    artists = music.all(libtype="artist")
    genres_set = set()
    artist_list = []
    for a in artists:
        genre_tags = [g.tag for g in (a.genres or [])]
        genres_set.update(genre_tags)
        artist_list.append({"title": a.title, "id": a.ratingKey, "genres": genre_tags})

    # Sample tracks (first 200 for context)
    sample_tracks_raw = music.all(libtype="track")[:200]
    sample_tracks = [
        {
            "id": t.ratingKey,
            "title": t.title,
            "artist": t.grandparentTitle,
            "album": t.parentTitle,
            "duration": t.duration,
            "genres": [g.tag for g in (t.genres or [])],
        }
        for t in sample_tracks_raw
    ]

    library_context = {
        "genres": sorted(list(genres_set)),
        "artists": artist_list,
        "sample_tracks": sample_tracks,
    }

    from services.ai_provider import PLAYLIST_SYSTEM, build_playlist_prompt
    user_prompt = build_playlist_prompt(body.prompt, library_context)

    logger.info(f"AI playlist request: {body.prompt[:100]}")

    try:
        raw = await provider.generate(PLAYLIST_SYSTEM, user_prompt)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Parse JSON response
    try:
        # Strip any accidental markdown fences
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        spec = json.loads(clean.strip())
    except json.JSONDecodeError:
        logger.error(f"AI returned invalid JSON: {raw[:500]}")
        raise HTTPException(status_code=502, detail="AI returned an invalid response. Try rephrasing your request.")

    # Execute the spec against Plex
    selected_tracks = []

    if spec.get("mode") == "custom" and spec.get("track_ids"):
        # AI picked specific tracks
        for tid in spec["track_ids"][:body.max_tracks]:
            try:
                selected_tracks.append(music.fetchItem(tid))
            except Exception:
                pass

    elif spec.get("mode") == "genre" and spec.get("genre"):
        tracks = music.searchTracks(genre=spec["genre"])
        selected_tracks = tracks[:spec.get("max_tracks", body.max_tracks)]

    elif spec.get("mode") in ("similar_artist", "mixed") and spec.get("seed_artist"):
        results = music.searchArtists(title=spec["seed_artist"])
        if results:
            seed = results[0]
            similar_names = {s.tag.lower() for s in (seed.similar or [])}
            similar_names.add(seed.title.lower())
            if spec.get("genre"):
                similar_names.add(spec["genre"].lower())
            for artist in music.all(libtype="artist"):
                if artist.title.lower() in similar_names:
                    selected_tracks.extend(artist.tracks())
            selected_tracks = selected_tracks[:spec.get("max_tracks", body.max_tracks)]

    if not selected_tracks:
        raise HTTPException(
            status_code=404,
            detail=f"AI suggested parameters but no matching tracks were found. AI reasoning: {spec.get('reasoning', '')}",
        )

    if spec.get("shuffle"):
        import random
        random.shuffle(selected_tracks)

    playlist_name = spec.get("playlist_name") or f"AI: {body.prompt[:40]}"
    total_ms = sum(t.duration or 0 for t in selected_tracks)

    playlist_id = None
    if body.push_to_plex:
        plex = get_plex()
        try:
            playlist = plex.createPlaylist(playlist_name, items=selected_tracks)
            playlist_id = playlist.ratingKey
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create playlist in Plex: {str(e)}")

    return {
        "name": playlist_name,
        "track_count": len(selected_tracks),
        "total_minutes": round(total_ms / 60000, 1),
        "reasoning": spec.get("reasoning", ""),
        "plex_playlist_id": playlist_id,
        "ai_spec": spec,
        "tracks": [
            {
                "id": t.ratingKey,
                "title": t.title,
                "artist": t.grandparentTitle,
                "duration": t.duration,
            }
            for t in selected_tracks[:50]  # preview first 50
        ],
    }


@router.post("/discover")
async def ai_discover(body: AIDiscoveryRequest, _: str = Depends(verify_token)):
    """
    Use AI to suggest new artists and music based on a natural language prompt
    and the user's library context.
    """
    provider = get_ai_or_raise()
    music = get_music_library()

    artists = music.all(libtype="artist")
    genres_set = set()
    artist_list = []
    for a in artists:
        genre_tags = [g.tag for g in (a.genres or [])]
        genres_set.update(genre_tags)
        artist_list.append({"title": a.title})

    library_context = {"genres": sorted(list(genres_set)), "artists": artist_list}

    from services.ai_provider import DISCOVERY_SYSTEM, build_discovery_prompt
    user_prompt = build_discovery_prompt(body.prompt, library_context)

    try:
        raw = await provider.generate(DISCOVERY_SYSTEM, user_prompt)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        result = json.loads(clean.strip())
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned an invalid response.")

    # Mark which suggestions are already in library
    library_names = {a["title"].lower() for a in artist_list}
    for artist in result.get("suggested_artists", []):
        result.setdefault("in_library", {})[artist] = artist.lower() in library_names

    return result


@router.post("/chat")
async def ai_chat(
    body: AIPlaylistRequest,
    _: str = Depends(verify_token),
):
    """
    Free-form chat with the AI about your music library.
    Doesn't generate a playlist — just answers questions.
    """
    provider = get_ai_or_raise()
    music = get_music_library()
    artists = [a.title for a in music.all(libtype="artist")][:100]
    genres = set()
    for a in music.all(libtype="artist"):
        for g in (a.genres or []):
            genres.add(g.tag)

    system = f"""You are a helpful music assistant. The user has a Plex music library with these artists: {json.dumps(artists[:80])} and genres: {json.dumps(sorted(list(genres)))}. Help them explore their music and discover new artists. Be friendly and concise."""

    try:
        response = await provider.generate(system, body.prompt)
        return {"response": response}
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
