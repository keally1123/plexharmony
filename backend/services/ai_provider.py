"""
AI Provider abstraction layer
Supports: Anthropic Claude, OpenAI (ChatGPT), Ollama (self-hosted)
The active provider is selected in user settings. All providers share
the same interface: generate(system, user) -> str
"""
import json
import logging
from typing import Optional
import httpx

from config import settings

logger = logging.getLogger(__name__)
TIMEOUT = 60  # AI can be slow, especially Ollama on CPU


class AIProvider:
    """Base interface."""
    async def generate(self, system: str, user: str) -> str:
        raise NotImplementedError

    async def test(self) -> dict:
        raise NotImplementedError


class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model

    async def generate(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            if r.status_code == 401:
                raise ValueError("Invalid Anthropic API key")
            if r.status_code != 200:
                raise ValueError(f"Anthropic API error: {r.status_code} {r.text[:200]}")
            data = r.json()
            return data["content"][0]["text"]

    async def test(self) -> dict:
        try:
            result = await self.generate("You are a test.", "Reply with only the word: ok")
            return {"ok": True, "response": result.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def generate(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "content-type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": 2048,
                    "temperature": 0.7,
                },
            )
            if r.status_code == 401:
                raise ValueError("Invalid OpenAI API key")
            if r.status_code != 200:
                raise ValueError(f"OpenAI API error: {r.status_code} {r.text[:200]}")
            data = r.json()
            return data["choices"][0]["message"]["content"]

    async def test(self) -> dict:
        try:
            result = await self.generate("You are a test.", "Reply with only the word: ok")
            return {"ok": True, "response": result.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}


class OllamaProvider(AIProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.1"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            try:
                r = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "stream": False,
                        "options": {"temperature": 0.7},
                    },
                )
            except httpx.ConnectError:
                raise ValueError(f"Cannot connect to Ollama at {self.base_url}")
            if r.status_code != 200:
                raise ValueError(f"Ollama error: {r.status_code} {r.text[:200]}")
            data = r.json()
            return data["message"]["content"]

    async def test(self) -> dict:
        try:
            # First check if model exists
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                if r.status_code == 200:
                    models = [m["name"] for m in r.json().get("models", [])]
                    if not any(self.model in m for m in models):
                        return {"ok": False, "error": f"Model '{self.model}' not found. Available: {', '.join(models[:5])}"}
            result = await self.generate("You are a test.", "Reply with only the word: ok")
            return {"ok": True, "response": result.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def get_provider(ai_settings: dict) -> Optional[AIProvider]:
    """
    Build the correct AI provider from saved settings.
    Returns None if AI is disabled or not configured.
    """
    if not ai_settings or not ai_settings.get("enabled"):
        return None

    provider = ai_settings.get("provider", "none")

    if provider == "claude":
        key = ai_settings.get("claude_api_key") or settings.ANTHROPIC_API_KEY
        if not key:
            return None
        return ClaudeProvider(
            api_key=key,
            model=ai_settings.get("claude_model", "claude-sonnet-4-20250514"),
        )

    elif provider == "openai":
        key = ai_settings.get("openai_api_key") or settings.OPENAI_API_KEY
        if not key:
            return None
        return OpenAIProvider(
            api_key=key,
            model=ai_settings.get("openai_model", "gpt-4o"),
            base_url=ai_settings.get("openai_base_url", "https://api.openai.com/v1"),
        )

    elif provider == "ollama":
        return OllamaProvider(
            base_url=ai_settings.get("ollama_url") or settings.OLLAMA_URL or "http://localhost:11434",
            model=ai_settings.get("ollama_model", "llama3.1"),
        )

    elif provider == "custom":
        url = ai_settings.get("custom_url") or settings.CUSTOM_AI_URL
        port = ai_settings.get("custom_port", "")
        if url and port:
            url = f"{url.rstrip('/')}:{port}"
        if not url:
            return None
        return CustomProvider(
            base_url=url,
            model=ai_settings.get("custom_model") or settings.CUSTOM_AI_MODEL or "default",
            api_key=ai_settings.get("custom_api_key") or settings.CUSTOM_AI_API_KEY or "",
            username=ai_settings.get("custom_username", ""),
            password=ai_settings.get("custom_password", ""),
        )

    return None


# ── Playlist prompt templates ─────────────────────────────────────────────────

PLAYLIST_SYSTEM = """You are a music expert AI helping build playlists from a user's Plex library.
You receive:
1. The user's natural language request
2. Their library context: available genres, artists, and a sample of tracks

Your job is to respond ONLY with a valid JSON object — no prose, no markdown fences.

The JSON must have this exact shape:
{
  "mode": "genre" | "similar_artist" | "mixed" | "custom",
  "genre": "string or null",
  "seed_artist": "string or null",
  "track_ids": [list of integer track IDs to include, or empty list],
  "max_tracks": integer (5-500),
  "min_duration_minutes": integer or null,
  "max_duration_minutes": integer or null,
  "shuffle": boolean,
  "reasoning": "1-2 sentence human-readable explanation of the playlist logic",
  "playlist_name": "suggested name for this playlist"
}

Rules:
- If the user mentions specific artists from the library, use similar_artist mode with the closest match as seed_artist
- If they mention a mood or vibe, map it to the closest genre(s) in the library
- If they want something cross-genre, use custom mode and pick track_ids directly (up to 50)
- Always provide a creative, descriptive playlist_name
- reasoning should be friendly and explain the choices in plain English
- NEVER include tracks that aren't in the provided library context
"""


def build_playlist_prompt(user_request: str, library_context: dict) -> str:
    genres = library_context.get("genres", [])
    artists = library_context.get("artists", [])[:100]  # cap to avoid token overflow
    sample_tracks = library_context.get("sample_tracks", [])[:200]

    return f"""User request: "{user_request}"

Available genres in library:
{json.dumps(genres, indent=2)}

Artists in library (first 100):
{json.dumps([a["title"] for a in artists], indent=2)}

Sample tracks (id, title, artist, genre):
{json.dumps([{"id": t["id"], "title": t["title"], "artist": t["artist"], "genre": t.get("genres", [])} for t in sample_tracks], indent=2)}

Respond with the JSON playlist specification only."""


DISCOVERY_SYSTEM = """You are a music expert AI helping a user discover new music based on their existing library.
You receive their library's artists and genres, plus a natural language request.

Respond ONLY with a valid JSON object:
{
  "suggested_artists": ["artist name", ...],
  "suggested_genres": ["genre", ...],
  "reasoning": "friendly explanation of why these suggestions fit",
  "search_terms": ["term to search Last.fm", ...]
}

Base suggestions on the user's library taste. Suggest artists NOT already in their library.
"""


def build_discovery_prompt(user_request: str, library_context: dict) -> str:
    artists = [a["title"] for a in library_context.get("artists", [])[:80]]
    genres = library_context.get("genres", [])
    return f"""User request: "{user_request}"

Their library has these artists: {json.dumps(artists)}
Their library has these genres: {json.dumps(genres)}

Suggest new music they don't already have. JSON only."""


class CustomProvider(AIProvider):
    """
    Generic OpenAI-compatible self-hosted endpoint.
    Works with LM Studio, LocalAI, Jan, Koboldcpp, text-generation-webui, etc.
    """
    def __init__(self, base_url: str, model: str, api_key: str = "", username: str = "", password: str = ""):
        self.model = model
        self.api_key = api_key
        # Build full URL
        self.base_url = base_url.rstrip("/")
        # Auth headers
        self.headers = {"content-type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
        self.auth = (username, password) if username else None

    async def generate(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            try:
                r = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=self.headers,
                    auth=self.auth,
                    json={
                        "model": self.model or "default",
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "max_tokens": 2048,
                        "temperature": 0.7,
                    },
                )
            except httpx.ConnectError:
                raise ValueError(f"Cannot connect to custom AI endpoint at {self.base_url}")
            if r.status_code == 401:
                raise ValueError("Custom AI endpoint authentication failed — check API key / credentials")
            if r.status_code != 200:
                raise ValueError(f"Custom AI endpoint error: {r.status_code} {r.text[:200]}")
            data = r.json()
            return data["choices"][0]["message"]["content"]

    async def test(self) -> dict:
        try:
            # Try listing models first — most OpenAI-compat servers support /v1/models
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.base_url}/v1/models", headers=self.headers, auth=self.auth)
                models = []
                if r.status_code == 200:
                    models = [m.get("id") for m in r.json().get("data", [])]
            result = await self.generate("You are a test.", "Reply with only the word: ok")
            return {"ok": True, "response": result.strip(), "available_models": models[:5]}
        except Exception as e:
            return {"ok": False, "error": str(e)}
