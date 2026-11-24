from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional

from fastapi import Request, Response

from app.config import ACCESS_PASSWORD, AUTH_SECRET

COOKIE_NAME = "kazumi_session"
COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def is_auth_enabled() -> bool:
    return bool(ACCESS_PASSWORD)


def _sign(payload: str) -> str:
    return hmac.new(AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token() -> str:
    issued = str(int(time.time()))
    pw_hash = hashlib.sha256(ACCESS_PASSWORD.encode("utf-8")).hexdigest()[:16]
    payload = f"{issued}.{pw_hash}"
    return f"{payload}.{_sign(payload)}"


def verify_session_token(token: Optional[str]) -> bool:
    if not is_auth_enabled():
        return True
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 3:
        return False
    issued_str, pw_hash, sig = parts
    payload = f"{issued_str}.{pw_hash}"
    if not hmac.compare_digest(sig, _sign(payload)):
        return False
    expected_pw_hash = hashlib.sha256(ACCESS_PASSWORD.encode("utf-8")).hexdigest()[:16]
    if not hmac.compare_digest(pw_hash, expected_pw_hash):
        return False
    try:
        issued = int(issued_str)
    except ValueError:
        return False
    return (time.time() - issued) < COOKIE_TTL_SECONDS


def verify_password(candidate: str) -> bool:
    if not is_auth_enabled():
        return True
    return hmac.compare_digest(candidate.strip(), ACCESS_PASSWORD)


def is_request_authenticated(request: Request) -> bool:
    if not is_auth_enabled():
        return True
    token = request.cookies.get(COOKIE_NAME)
    return verify_session_token(token)


def set_session_cookie(response: Response, request: Request) -> None:
    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session_token(),
        max_age=COOKIE_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=is_https,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
