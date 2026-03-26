from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from routes.plex_routes import plex_bp
from routes.playlist_routes import playlist_bp
from routes.suggestions_routes import suggestions_bp

app = Flask(__name__)
CORS(app, origins="*")

app.register_blueprint(plex_bp, url_prefix="/api/plex")
app.register_blueprint(playlist_bp, url_prefix="/api/playlists")
app.register_blueprint(suggestions_bp, url_prefix="/api/suggestions")

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": "1.0.0"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG", "false").lower() == "true")
