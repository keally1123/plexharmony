# PlexHarmony

**v0.5.0** — Smart playlist manager and music discovery tool for Plex Media Server.

PlexHarmony is a self-hosted web application that gives you:

- **Playlist generation** by genre, sonic similarity, or AI natural language
- **Music discovery** via Last.fm — find similar artists you don't own yet
- **Metadata tagging** via Beets, MusicBrainz, and Picard
- **Acquisition pipeline** — add artists to Lidarr, manage torrent and Usenet clients
- **AI Assistant** — describe playlists in plain English, chat about your library (Claude, ChatGPT, Ollama, any OpenAI-compatible endpoint)
- **Customizable UI** — 7 theme presets plus full custom color control

---

## Requirements

- Docker or Docker Compose
- Plex Media Server with a music library
- Plex authentication token

Optional: Last.fm API key, Beets, MusicBrainz, Picard, Lidarr, qBittorrent, Deluge, SABnzbd, Anthropic/OpenAI/Ollama API

---

## Quick Start

**1. Get your Plex token:**
https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/

**2. Generate a password hash:**
```bash
pip install bcrypt
python backend/generate_password_hash.py
```

**3. Create `.env`:**
```bash
cp .env.example .env
# Edit with your values — minimum required:
# PLEX_URL, PLEX_TOKEN, ADMIN_PASSWORD_HASH, SECRET_KEY
```

Generate a secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**4. Run:**
```bash
docker compose up -d
```

Open `http://localhost:8000`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PLEX_URL` | Yes | — | Plex server URL |
| `PLEX_TOKEN` | Yes | — | Plex auth token |
| `PLEX_MUSIC_LIBRARY` | | `Music` | Library section name (case-sensitive) |
| `ADMIN_USERNAME` | | `admin` | Login username |
| `ADMIN_PASSWORD_HASH` | Yes | — | bcrypt hash from generate_password_hash.py |
| `SECRET_KEY` | Yes | — | 64-char random string |
| `LASTFM_API_KEY` | | — | Free at last.fm/api |
| `ALLOWED_HOSTS` | | `localhost` | Comma-separated hostnames |
| `ALLOWED_ORIGINS` | | `http://localhost:8000` | Comma-separated origins |
| `FORCE_HTTPS` | | `false` | Use behind HTTPS reverse proxy |

All other integrations (Beets, Lidarr, AI providers, download clients) can be configured through the Settings UI after first login.

---

## TrueNAS SCALE

1. Apps → Discover Apps → Custom App → Docker Compose
2. Paste `docker-compose.yml`
3. Set env vars in the UI or point to an `.env` file on a dataset

Pull from GitHub Container Registry:
```yaml
image: ghcr.io/keally1123/plexharmony:latest
```

Persist settings with a volume mount to `/app/data`.

---

## Reverse Proxy

Caddy example:
```
plexharmony.yourdomain.com {
    reverse_proxy localhost:8000
}
```

Then set `FORCE_HTTPS=true` and update `ALLOWED_HOSTS` / `ALLOWED_ORIGINS`.

---

## Security

- JWT with configurable session length, bcrypt with cost 12
- IP-based brute force lockout (5 attempts / 15 min)
- Security headers, suspicious path blocking
- Non-root container, read-only filesystem
- All secrets via environment variables

Designed for LAN or VPN access. Use a reverse proxy with HTTPS for remote access.

---

## Development

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

---

## License

MIT

---

## Legal Notice

This software is for personal media management only. The author does not condone illegal use. All download client integrations are management interfaces for content you legally own. You are responsible for complying with all laws in your jurisdiction.
