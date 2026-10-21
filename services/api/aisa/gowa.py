"""GOWA (go-whatsapp-web-multidevice) REST client and webhook signature check."""

from __future__ import annotations

import base64
import hashlib
import hmac

import httpx

from .config import settings

MAX_CHARS = 3500


def jid(phone: str) -> str:
    return f"{''.join(ch for ch in phone if ch.isdigit())}@s.whatsapp.net"


def split_message(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Split on line boundaries so each part stays under `limit` characters."""
    parts: list[str] = []
    cur = ""
    for line in text.split("\n"):
        while len(line) > limit:  # a single overlong line is hard-cut
            if cur:
                parts.append(cur)
                cur = ""
            parts.append(line[:limit])
            line = line[limit:]
        candidate = f"{cur}\n{line}" if cur else line
        if len(candidate) > limit:
            parts.append(cur)
            cur = line
        else:
            cur = candidate
    if cur.strip():
        parts.append(cur)
    return parts


def send(phone: str, text: str) -> list[str]:
    """Send `text` (split if long). Returns GOWA message ids; raises on a failed send."""
    s = settings()
    headers = {"Authorization": "Basic " + base64.b64encode(s.gowa_basic_auth.encode()).decode()}
    if s.gowa_device_id:
        headers["X-Device-Id"] = s.gowa_device_id
    ids: list[str] = []
    with httpx.Client(base_url=s.gowa_base_url, timeout=30, headers=headers) as c:
        for part in split_message(text):
            r = c.post("/send/message", json={"phone": jid(phone), "message": part})
            r.raise_for_status()
            body = r.json()
            if body.get("code") != "SUCCESS":
                raise RuntimeError(f"GOWA menolak pesan: {body}")
            ids.append(str((body.get("results") or {}).get("message_id", "")))
    return ids


def signature_valid(raw: bytes, header: str | None, secret: str) -> bool:
    """`X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(raw body, secret). No secret = reject."""
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256=").strip().lower())
