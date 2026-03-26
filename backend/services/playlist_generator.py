from collections import defaultdict
from itertools import combinations
import logging

logger = logging.getLogger(__name__)


class PlaylistGeneratorService:
    """
    Generates playlist suggestions based on:
    - Genre groupings
    - Sonic similarity (shared genres, moods, styles, similar artist tags)
    - Mood-based clustering
    """

    def generate_by_genre(self, tracks, artists, min_tracks=5):
        """Group tracks by primary genre."""
        genre_map = defaultdict(list)

        # Index artist metadata for enrichment
        artist_index = {a["title"].lower(): a for a in artists}

        for track in tracks:
            genres = track.get("genres", [])

            # Fallback: inherit genres from artist
            if not genres:
                artist_data = artist_index.get(track["artist"].lower(), {})
                genres = artist_data.get("genres", [])

            if not genres:
                genres = ["Uncategorized"]

            for genre in genres[:2]:  # max 2 genres per track to avoid bloat
                genre_map[genre].append(track)

        playlists = []
        for genre, genre_tracks in genre_map.items():
            if len(genre_tracks) >= min_tracks:
                # Deduplicate by track id
                seen = set()
                unique_tracks = []
                for t in genre_tracks:
                    if t["id"] not in seen:
                        seen.add(t["id"])
                        unique_tracks.append(t)
                playlists.append({
                    "suggested_title": f"{genre} Mix",
                    "genre": genre,
                    "type": "genre",
                    "tracks": unique_tracks,
                    "track_count": len(unique_tracks),
                    "description": f"All your {genre} tracks in one place.",
                    "tags": [genre],
                })

        return sorted(playlists, key=lambda p: p["track_count"], reverse=True)

    def generate_by_mood(self, tracks, artists, min_tracks=5):
        """Group tracks by mood tags."""
        mood_map = defaultdict(list)
        artist_index = {a["title"].lower(): a for a in artists}

        for track in tracks:
            moods = track.get("moods", [])
            if not moods:
                artist_data = artist_index.get(track["artist"].lower(), {})
                moods = artist_data.get("moods", [])
            for mood in moods[:2]:
                mood_map[mood].append(track)

        playlists = []
        for mood, mood_tracks in mood_map.items():
            if len(mood_tracks) >= min_tracks:
                seen = set()
                unique = [t for t in mood_tracks if not (t["id"] in seen or seen.add(t["id"]))]
                playlists.append({
                    "suggested_title": f"{mood} Vibes",
                    "mood": mood,
                    "type": "mood",
                    "tracks": unique,
                    "track_count": len(unique),
                    "description": f"Tracks with a {mood.lower()} feel.",
                    "tags": [mood],
                })

        return sorted(playlists, key=lambda p: p["track_count"], reverse=True)

    def generate_sonic_similarity(self, artists, tracks, min_artists=2):
        """
        Cluster artists that share similar metadata (genres, moods, styles, similar tags).
        Returns playlists per cluster.
        """
        # Build artist similarity graph
        artist_clusters = self._cluster_artists_by_similarity(artists)
        artist_track_map = defaultdict(list)
        for track in tracks:
            artist_track_map[track["artist"].lower()].append(track)

        playlists = []
        for cluster in artist_clusters:
            if len(cluster["artists"]) < min_artists:
                continue
            cluster_tracks = []
            for artist_name in cluster["artists"]:
                cluster_tracks.extend(artist_track_map.get(artist_name.lower(), []))

            if len(cluster_tracks) < 5:
                continue

            artist_names = cluster["artists"][:3]
            title = f"Sounds Like: {' & '.join(artist_names[:2])}"
            if len(cluster["artists"]) > 2:
                title += f" + {len(cluster['artists']) - 2} more"

            playlists.append({
                "suggested_title": title,
                "type": "sonic",
                "artists": cluster["artists"],
                "shared_tags": cluster["shared_tags"],
                "tracks": cluster_tracks,
                "track_count": len(cluster_tracks),
                "description": f"Sonically similar artists: {', '.join(cluster['artists'][:5])}. Shared traits: {', '.join(cluster['shared_tags'][:3])}.",
                "tags": cluster["shared_tags"][:5],
            })

        return sorted(playlists, key=lambda p: p["track_count"], reverse=True)

    def _cluster_artists_by_similarity(self, artists):
        """Simple greedy clustering based on shared tags."""
        def artist_tags(artist):
            tags = set()
            tags.update(artist.get("genres", []))
            tags.update(artist.get("moods", []))
            tags.update(artist.get("styles", []))
            return tags

        def similarity_score(a1, a2):
            t1 = artist_tags(a1)
            t2 = artist_tags(a2)
            if not t1 or not t2:
                return 0, set()
            shared = t1 & t2
            score = len(shared) / (len(t1 | t2) or 1)
            return score, shared

        # Build similarity pairs
        artist_list = artists[:]
        visited = set()
        clusters = []

        for i, artist in enumerate(artist_list):
            if artist["title"] in visited:
                continue
            cluster_members = [artist["title"]]
            cluster_tags = set(artist_tags(artist))
            visited.add(artist["title"])

            for j, other in enumerate(artist_list):
                if i == j or other["title"] in visited:
                    continue
                score, shared = similarity_score(artist, other)
                if score >= 0.3 and len(shared) >= 2:
                    cluster_members.append(other["title"])
                    cluster_tags &= shared
                    visited.add(other["title"])

            if len(cluster_members) >= 2:
                clusters.append({
                    "artists": cluster_members,
                    "shared_tags": list(cluster_tags),
                })

        return clusters

    def generate_similar_artist_playlist(self, artist_name, artists, tracks, plex_similar_tags=None):
        """Build a playlist around one artist and their Plex-tagged similar artists."""
        artist_track_map = defaultdict(list)
        for track in tracks:
            artist_track_map[track["artist"].lower()].append(track)

        artist_index = {a["title"].lower(): a for a in artists}
        target = artist_index.get(artist_name.lower())
        if not target:
            return None

        # Collect similar artist names from Plex metadata
        similar_names = set()
        similar_names.add(artist_name.lower())
        for sim in target.get("similar", []):
            if sim.lower() in artist_index:
                similar_names.add(sim.lower())

        playlist_tracks = []
        for name in similar_names:
            playlist_tracks.extend(artist_track_map.get(name, []))

        if not playlist_tracks:
            return None

        return {
            "suggested_title": f"Similar to {artist_name}",
            "type": "similar_artist",
            "seed_artist": artist_name,
            "similar_artists": list(similar_names - {artist_name.lower()}),
            "tracks": playlist_tracks,
            "track_count": len(playlist_tracks),
            "description": f"Music similar to {artist_name}, curated from your library.",
            "tags": target.get("genres", [])[:3],
        }

    def get_genres_summary(self, tracks, artists):
        """Return a summary of all genres in the library."""
        genre_counts = defaultdict(int)
        artist_index = {a["title"].lower(): a for a in artists}

        for track in tracks:
            genres = track.get("genres", [])
            if not genres:
                artist_data = artist_index.get(track["artist"].lower(), {})
                genres = artist_data.get("genres", [])
            for g in genres:
                genre_counts[g] += 1

        return sorted(
            [{"genre": g, "track_count": c} for g, c in genre_counts.items()],
            key=lambda x: x["track_count"],
            reverse=True
        )


playlist_generator = PlaylistGeneratorService()
