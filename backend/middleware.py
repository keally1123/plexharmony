"""
Security middleware - adds security headers, HTTPS redirect, request validation
"""
import time
import logging
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, RedirectResponse
from config import settings

logger = logging.getLogger(__name__)

# Simple in-memory brute force tracker
login_attempts: dict = defaultdict(list)


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Force HTTPS in production
        if settings.FORCE_HTTPS and request.url.scheme == "http":
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)

        # Block obviously malicious paths
        path = request.url.path.lower()
        blocked_patterns = [
            ".php", ".asp", ".aspx", ".jsp", ".cgi",
            "wp-admin", "wp-login", ".env", "/.git",
            "/etc/passwd", "cmd=", "exec(", "../",
            "<script", "union select", "drop table",
        ]
        if any(p in path for p in blocked_patterns):
            logger.warning(f"Blocked suspicious request: {path} from {request.client.host}")
            return Response(status_code=404)

        # Block oversized requests (10MB limit)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 10 * 1024 * 1024:
            return Response(status_code=413, content="Request too large")

        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self';"
        )
        if settings.FORCE_HTTPS:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Remove server identification
        response.headers.pop("server", None)
        response.headers.pop("x-powered-by", None)

        return response


def record_failed_login(ip: str) -> bool:
    """Record failed login attempt, return True if account should be locked."""
    now = time.time()
    window = settings.LOCKOUT_MINUTES * 60
    # Clean old attempts
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < window]
    login_attempts[ip].append(now)
    locked = len(login_attempts[ip]) >= settings.MAX_LOGIN_ATTEMPTS
    if locked:
        logger.warning(f"IP {ip} locked out after {settings.MAX_LOGIN_ATTEMPTS} failed login attempts")
    return locked


def is_locked_out(ip: str) -> bool:
    """Check if IP is currently locked out."""
    now = time.time()
    window = settings.LOCKOUT_MINUTES * 60
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < window]
    return len(login_attempts[ip]) >= settings.MAX_LOGIN_ATTEMPTS


def clear_login_attempts(ip: str):
    """Clear login attempts after successful login."""
    login_attempts.pop(ip, None)
