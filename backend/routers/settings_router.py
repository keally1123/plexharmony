"""
Settings router - persists all user preferences to /app/data/user_settings.json
"""
import json, logging, os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from routers.auth import verify_token

logger = logging.getLogger(__name__)
router = APIRouter()

SETTINGS_PATH = Path(os.environ.get("DATA_DIR", "/app/data")) / "user_settings.json"
SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "theme": {"mode": "dark", "accent": "#6d83f2", "bg": "#0d0f14", "card": "#13161e", "border": "#1e2230", "text": "#e8eaf0", "muted": "#5a6070"},
    "tools": {"beets_url": "", "musicbrainz_url": "", "picard_url": ""},
    "acquisition": {
        "enabled": False,
        # Lidarr (permanent, primary music manager)
        "lidarr_url": "", "lidarr_api_key": "", "lidarr_username": "", "lidarr_password": "", "lidarr_root_folder": "",
        # Connected download clients — each entry: {type, label, url, username, password, api_key}
        "clients": [],
    },
    "ai": {
        "enabled": False,
        "provider": "none",
        "claude_api_key": "", "claude_model": "claude-sonnet-4-20250514",
        "openai_api_key": "", "openai_model": "gpt-4o", "openai_base_url": "https://api.openai.com/v1",
        "ollama_url": "http://localhost:11434", "ollama_model": "llama3.1",
        # Self-hosted / custom OpenAI-compatible endpoint
        "custom_url": "", "custom_port": "", "custom_username": "", "custom_password": "", "custom_api_key": "", "custom_model": "",
    },
    "playlist_defaults": {"max_tracks": 50, "min_duration_minutes": None, "max_duration_minutes": None, "push_to_plex": True, "shuffle": False},
}

PRESET_THEMES = {
    "dark_indigo":  {"mode": "dark",  "accent": "#6d83f2", "bg": "#0d0f14", "card": "#13161e", "border": "#1e2230", "text": "#e8eaf0", "muted": "#5a6070"},
    "dark_emerald": {"mode": "dark",  "accent": "#34d399", "bg": "#0a0f0d", "card": "#111a15", "border": "#1a2e22", "text": "#e0ede6", "muted": "#527060"},
    "dark_rose":    {"mode": "dark",  "accent": "#f472b6", "bg": "#100d10", "card": "#1a131a", "border": "#2a1e2a", "text": "#ede0ed", "muted": "#6e526e"},
    "dark_amber":   {"mode": "dark",  "accent": "#fbbf24", "bg": "#0f0e09", "card": "#1a180e", "border": "#2a2615", "text": "#ede9d8", "muted": "#6e6840"},
    "dark_cyan":    {"mode": "dark",  "accent": "#22d3ee", "bg": "#090d0f", "card": "#0f181a", "border": "#16272b", "text": "#d8ecf0", "muted": "#406570"},
    "light_clean":  {"mode": "light", "accent": "#4f63d2", "bg": "#f5f6fa", "card": "#ffffff", "border": "#e2e5f0", "text": "#1a1d2e", "muted": "#8890b0"},
    "light_warm":   {"mode": "light", "accent": "#d97706", "bg": "#faf8f5", "card": "#ffffff", "border": "#ede8df", "text": "#1f1a12", "muted": "#9a8c70"},
}

# Client type definitions — what fields each client type supports
CLIENT_TYPES = {
    "qbittorrent": {"label": "qBittorrent", "fields": ["url", "username", "password"], "router": "qbittorrent"},
    "deluge":      {"label": "Deluge",       "fields": ["url", "password"],             "router": "deluge"},
    "torrent_generic": {"label": "Generic BitTorrent (WebUI)", "fields": ["url", "username", "password", "api_key"], "router": None},
    "sabnzbd":     {"label": "SABnzbd",      "fields": ["url", "username", "password", "api_key"], "router": "sabnzbd"},
    "nzb_generic": {"label": "Generic Usenet (NZB)", "fields": ["url", "username", "password", "api_key"], "router": None},
}


def load_settings() -> dict:
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH) as f:
                stored = json.load(f)
            merged = json.loads(json.dumps(DEFAULT_SETTINGS))
            for k, v in stored.items():
                if isinstance(v, dict) and k in merged:
                    merged[k] = {**merged[k], **v}
                else:
                    merged[k] = v
            return merged
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
    return json.loads(json.dumps(DEFAULT_SETTINGS))


def save_settings(data: dict):
    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        raise HTTPException(status_code=500, detail="Could not save settings")


def _mask(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 4:
        return "*" * len(val)
    return "*" * 8 + val[-4:]


def _is_masked(val: str) -> bool:
    return bool(val) and val.startswith("*")


@router.get("/")
async def get_settings(_: str = Depends(verify_token)):
    s = load_settings()
    safe = json.loads(json.dumps(s))
    # Mask secrets in AI section
    for key in ("claude_api_key", "openai_api_key", "custom_api_key", "custom_password"):
        if safe.get("ai", {}).get(key):
            safe["ai"][key] = _mask(safe["ai"][key])
    # Mask secrets in Lidarr
    if safe.get("acquisition", {}).get("lidarr_password"):
        safe["acquisition"]["lidarr_password"] = _mask(safe["acquisition"]["lidarr_password"])
    if safe.get("acquisition", {}).get("lidarr_api_key"):
        safe["acquisition"]["lidarr_api_key"] = _mask(safe["acquisition"]["lidarr_api_key"])
    # Mask client secrets
    for c in safe.get("acquisition", {}).get("clients", []):
        for f in ("password", "api_key"):
            if c.get(f):
                c[f] = _mask(c[f])
    return safe


@router.put("/")
async def update_settings(body: dict, _: str = Depends(verify_token)):
    current = load_settings()
    for section, values in body.items():
        if isinstance(values, dict) and section in current:
            for k, v in values.items():
                if k == "clients":
                    # Replace entire clients list, but preserve masked fields
                    new_clients = []
                    old_clients = {c.get("id"): c for c in current[section].get("clients", [])}
                    for nc in (v or []):
                        old = old_clients.get(nc.get("id"), {})
                        merged_client = {**nc}
                        for f in ("password", "api_key"):
                            if _is_masked(nc.get(f, "")):
                                merged_client[f] = old.get(f, "")
                        new_clients.append(merged_client)
                    current[section]["clients"] = new_clients
                elif isinstance(v, str) and _is_masked(v):
                    pass  # don't overwrite with masked placeholder
                else:
                    current[section][k] = v
        else:
            current[section] = values
    save_settings(current)
    _apply_to_config(current)
    return {"saved": True}


@router.get("/themes/presets")
async def get_presets(_: str = Depends(verify_token)):
    return {"presets": PRESET_THEMES}


@router.post("/themes/preset/{name}")
async def apply_preset(name: str, _: str = Depends(verify_token)):
    if name not in PRESET_THEMES:
        raise HTTPException(status_code=404, detail="Preset not found")
    current = load_settings()
    current["theme"] = PRESET_THEMES[name]
    save_settings(current)
    return current


@router.get("/client-types")
async def get_client_types(_: str = Depends(verify_token)):
    return {"client_types": CLIENT_TYPES}


@router.post("/reset")
async def reset(_: str = Depends(verify_token)):
    save_settings(json.loads(json.dumps(DEFAULT_SETTINGS)))
    return DEFAULT_SETTINGS


def _apply_to_config(data: dict):
    from config import settings as cfg
    acq = data.get("acquisition", {})
    if acq.get("lidarr_url"):      cfg.LIDARR_URL = acq["lidarr_url"]
    if acq.get("lidarr_api_key") and not _is_masked(acq["lidarr_api_key"]):
        cfg.LIDARR_API_KEY = acq["lidarr_api_key"]
    if acq.get("lidarr_root_folder"): cfg.LIDARR_ROOT_FOLDER = acq["lidarr_root_folder"]

    # Apply first client of each type to config
    for client in acq.get("clients", []):
        t = client.get("type")
        url = client.get("url", "")
        pw = client.get("password", "") if not _is_masked(client.get("password", "")) else ""
        key = client.get("api_key", "") if not _is_masked(client.get("api_key", "")) else ""
        if t == "qbittorrent":
            cfg.QBIT_URL = url
            cfg.QBIT_USERNAME = client.get("username", "admin")
            if pw: cfg.QBIT_PASSWORD = pw
        elif t == "deluge":
            cfg.DELUGE_URL = url
            if pw: cfg.DELUGE_PASSWORD = pw
        elif t == "sabnzbd":
            cfg.SABNZBD_URL = url
            if key: cfg.SABNZBD_API_KEY = key

    ai = data.get("ai", {})
    if ai.get("claude_api_key") and not _is_masked(ai["claude_api_key"]):
        cfg.ANTHROPIC_API_KEY = ai["claude_api_key"]
    if ai.get("openai_api_key") and not _is_masked(ai["openai_api_key"]):
        cfg.OPENAI_API_KEY = ai["openai_api_key"]
    if ai.get("ollama_url"): cfg.OLLAMA_URL = ai["ollama_url"]
    if ai.get("custom_url"):
        port = ai.get("custom_port", "")
        cfg.CUSTOM_AI_URL = f"{ai['custom_url']}:{port}" if port else ai["custom_url"]
    tools = data.get("tools", {})
    if tools.get("beets_url"):       cfg.BEETS_URL = tools["beets_url"]
    if tools.get("musicbrainz_url"): cfg.MUSICBRAINZ_URL = tools["musicbrainz_url"]
    if tools.get("picard_url"):      cfg.PICARD_URL = tools["picard_url"]
