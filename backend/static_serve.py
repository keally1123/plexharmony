"""
Static file serving patch - appended to main.py behavior via separate mount.
FastAPI serves the built React SPA from /app/backend/static/
"""
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


def mount_static(app):
    """Mount static files and SPA fallback. Call after all routers are added."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(static_dir):
        # Serve static assets
        app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

        # SPA fallback - serve index.html for all non-API routes
        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            index = os.path.join(static_dir, "index.html")
            if os.path.exists(index):
                return FileResponse(index)
            return {"detail": "Frontend not built"}
