from plexapi.server import PlexServer
from plexapi.exceptions import NotFound, Unauthorized
import os
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


class PlexService:
    def __init__(self):
        self._server = None

    def _get_server(self):
        if self._server is None:
            baseurl = os.environ.get("PLEX_URL", "http://localhost:32400")
            token = os.environ.get("PLEX_TOKEN", "")
            if not token:
                raise ValueError("PLEX_TOKEN environment variable is not set")
            self._server = PlexServer(baseurl, token)
        return self._server

    def test_connection(self):
        try:
            server = self._get_server()
            return {"connected": True, "server_name": server.friendlyName, "version": server.version}
        except Unauthorized:
            return {"connected": False, "error": "Invalid Plex token"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    def get_music_libraries(self):
        server = self._get_server()
        return [
            {"key": lib.key, "title": lib.title, "type": lib.type}
            for lib in server.library.sections()
            if lib.type == "artist"
        ]

    def get_all_artists(self, library_key=None):
        server = self._get_server()
        libraries = self._get_music_sections(server, library_key)
        artists = []
        for lib in libraries:
            for artist in lib.all():
                genres = [g.tag for g in (artist.genres or [])]
                moods = [m.tag for m in (getattr(artist, "moods", None) or [])]
                styles = [s.tag for s in (getattr(artist, "styles", None) or [])]
                similar = []
                try:
                    similar = [s.tag for s in (getattr(artist, "similar", None) or [])]
                except Exception:
                    pass
                artists.append({
                    "id": artist.ratingKey,
                    "title": artist.title,
                    "thumb": artist.thumb,
                    "genres": genres,
                    "moods": moods,
                    "styles": styles,
                    "similar": similar,
                    "library_key": lib.key,
                })
        return artists

    def get_all_tracks(self, library_key=None):
        server = self._get_server()
        libraries = self._get_music_sections(server, library_key)
        tracks = []
        for lib in libraries:
            for track in lib.searchTracks():
                genres = [g.tag for g in (track.genres or [])]
                moods = [m.tag for m in (getattr(track, "moods", None) or [])]
                artists = [a.tag for a in (track.artists() or [])] if hasattr(track, "artists") else []
                tracks.append({
                    "id": track.ratingKey,
                    "title": track.title,
                    "artist": track.grandparentTitle,
                    "album": track.parentTitle,
                    "genres": genres,
                    "moods": moods,
                    "duration": track.duration,
                    "thumb": track.thumb,
                    "year": track.year,
                    "rating": track.userRating,
                    "library_key": lib.key,
                })
        return tracks

    def get_all_albums(self, library_key=None):
        server = self._get_server()
        libraries = self._get_music_sections(server, library_key)
        albums = []
        for lib in libraries:
            for album in lib.searchAlbums():
                genres = [g.tag for g in (album.genres or [])]
                moods = [m.tag for m in (getattr(album, "moods", None) or [])]
                styles = [s.tag for s in (getattr(album, "styles", None) or [])]
                albums.append({
                    "id": album.ratingKey,
                    "title": album.title,
                    "artist": album.parentTitle,
                    "year": album.year,
                    "genres": genres,
                    "moods": moods,
                    "styles": styles,
                    "thumb": album.thumb,
                    "library_key": lib.key,
                })
        return albums

    def get_existing_playlists(self):
        server = self._get_server()
        playlists = []
        for pl in server.playlists():
            if pl.playlistType == "audio":
                playlists.append({
                    "id": pl.ratingKey,
                    "title": pl.title,
                    "duration": pl.duration,
                    "track_count": pl.leafCount,
                    "thumb": pl.thumb,
                    "summary": pl.summary,
                })
        return playlists

    def create_playlist(self, title, track_ids, summary=""):
        server = self._get_server()
        # Fetch track objects
        tracks = []
        for tid in track_ids:
            try:
                item = server.fetchItem(int(tid))
                tracks.append(item)
            except NotFound:
                logger.warning(f"Track {tid} not found, skipping")
        if not tracks:
            raise ValueError("No valid tracks found for playlist")
        playlist = server.createPlaylist(title, items=tracks)
        if summary:
            playlist.edit(summary=summary)
        return {
            "id": playlist.ratingKey,
            "title": playlist.title,
            "track_count": len(tracks),
            "summary": summary,
        }

    def update_playlist(self, playlist_id, track_ids=None, title=None, summary=None):
        server = self._get_server()
        playlist = server.fetchItem(int(playlist_id))
        if title:
            playlist.edit(title=title)
        if summary is not None:
            playlist.edit(summary=summary)
        if track_ids is not None:
            playlist.removeItems(playlist.items())
            tracks = [server.fetchItem(int(tid)) for tid in track_ids]
            playlist.addItems(tracks)
        return {"success": True, "id": playlist_id}

    def delete_playlist(self, playlist_id):
        server = self._get_server()
        playlist = server.fetchItem(int(playlist_id))
        playlist.delete()
        return {"success": True}

    def _get_music_sections(self, server, library_key=None):
        sections = [s for s in server.library.sections() if s.type == "artist"]
        if library_key:
            sections = [s for s in sections if str(s.key) == str(library_key)]
        return sections


plex_service = PlexService()
