"""Route authentication: the internal key (dashboard, manual triggers) and Cloud Scheduler's
Google OIDC ID token."""

from __future__ import annotations

import hmac
import logging
from collections.abc import Callable

from fastapi import Header, HTTPException

from .config import settings

log = logging.getLogger("aisa.auth")

# (token, audience) -> verified claims; raises ValueError on a bad token.
Verifier = Callable[[str, str], dict]


def google_verify(token: str, audience: str) -> dict:
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(token, Request(), audience=audience)


def key_ok(given: str | None, key: str) -> bool:
    return bool(key and given and hmac.compare_digest(given, key))


def oidc_ok(authorization: str | None, sa_email: str, audience: str, verify: Verifier) -> bool:
    """True when `authorization` is `Bearer <ID token>` signed by Google for `audience`
    and issued to `sa_email` (verified email). Unconfigured → never true."""
    if not (sa_email and audience and authorization):
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return False
    try:
        claims = verify(token.strip(), audience)
    except Exception as e:  # noqa: BLE001 — expired, wrong audience, bad signature, unreachable certs
        log.warning("OIDC token rejected: %s", str(e)[:200])
        return False
    return claims.get("email") == sa_email and claims.get("email_verified") is True


def scheduler_or_key(authorization: str | None, x_aisa_key: str | None, *, key: str,
                     sa_email: str, audience: str, verify: Verifier) -> str:
    """Which credential was accepted ("oidc" or "key"). 503 when neither is configured,
    401 when the request carries no acceptable one."""
    if not key and not (sa_email and audience):
        raise HTTPException(503, "autentikasi penjadwal belum diatur")
    if oidc_ok(authorization, sa_email, audience, verify):
        return "oidc"
    if key_ok(x_aisa_key, key):
        return "key"
    raise HTTPException(401, "kredensial tidak valid")


def require_key(x_aisa_key: str | None = Header(None)) -> None:
    key = settings().internal_api_key
    if not key:
        raise HTTPException(503, "INTERNAL_API_KEY belum diatur")
    if not key_ok(x_aisa_key, key):
        raise HTTPException(401, "kunci tidak valid")


def require_scheduler_or_key(authorization: str | None = Header(None),
                             x_aisa_key: str | None = Header(None)) -> str:
    s = settings()
    via = scheduler_or_key(authorization, x_aisa_key, key=s.internal_api_key,
                           sa_email=s.scheduler_sa_email, audience=s.scheduler_audience,
                           verify=google_verify)
    log.info("scheduler route authenticated via %s", via)
    return via
