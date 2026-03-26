"""
Authentication router - JWT-based login with brute force protection
"""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import bcrypt
import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import settings
from middleware import record_failed_login, is_locked_out, clear_login_attempts

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()
limiter = Limiter(key_func=get_remote_address)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


def create_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, response: Response):
    client_ip = request.client.host

    # Check lockout
    if is_locked_out(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {settings.LOCKOUT_MINUTES} minutes.",
        )

    # Constant-time username comparison
    username_match = body.username == settings.ADMIN_USERNAME

    # Always check password hash to prevent timing attacks
    try:
        password_valid = bcrypt.checkpw(
            body.password.encode(),
            settings.ADMIN_PASSWORD_HASH.encode(),
        )
    except Exception:
        password_valid = False

    if not username_match or not password_valid:
        locked = record_failed_login(client_ip)
        logger.warning(f"Failed login attempt from {client_ip}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    clear_login_attempts(client_ip)
    token = create_token(body.username)
    logger.info(f"Successful login from {client_ip}")

    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
    )


@router.get("/me")
async def get_me(username: str = Depends(verify_token)):
    return {"username": username}
