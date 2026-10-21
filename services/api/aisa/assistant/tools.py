"""Read-only tools for the Asisten.

Every tool returns a compact, JSON-safe dict. There is no write tool: status
changes are the manager's commands, handled by code in the gateway.
"""

from __future__ import annotations

import functools
import logging
from datetime import timedelta
from typing import Optional

from . import store

CATEGORY_LABEL = {
    "sangat_cocok": "Sangat cocok",
    "cocok": "Cocok",
    "kurang_cocok": "Kurang cocok",
    "tidak_cocok": "Tidak cocok",
}
CRITERION_LABEL = {
    "tim": "Tim",
    "pasar": "Pasar & masalah",
    "produk": "Produk & keunggulan",
    "traksi": "Traksi",
    "bisnis": "Model bisnis & keuangan",
}
STATUS_LABEL = {
    "antre": "Antre",
    "dinilai_proses": "Sedang dinilai",
    "dinilai": "Dinilai",
    "perlu_dicek_manual": "Perlu dicek manual",
    "dihentikan": "Dihentikan",
}
GROUP_FIELDS = ("category", "sector", "stage", "status", "response", "outside_focus")

log = logging.getLogger(__name__)

TEXT_MAX = 220
QUOTE_MAX = 160
LIMIT_MAX = 25


def _cut(text: object, n: int = TEXT_MAX) -> object:
    if isinstance(text, str) and len(text) > n:
        return text[: n - 1].rstrip() + "…"
    return text


def _key(value: Optional[str]) -> str:
    return (value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _norm_category(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    k = _key(value)
    if k in CATEGORY_LABEL:
        return k
    raise ValueError(
        f"kategori '{value}' tidak dikenal; pilih salah satu: {', '.join(CATEGORY_LABEL)}"
    )


def _norm_status(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    k = _key(value)
    if k in STATUS_LABEL:
        return k
    raise ValueError(f"status '{value}' tidak dikenal; pilih salah satu: {', '.join(STATUS_LABEL)}")


def _score(p: dict) -> Optional[float]:
    return (p.get("assessment") or {}).get("score")


def _quality_outside_focus(p: dict) -> bool:
    """The stored flag holds only while the effective category is still Tidak cocok.

    A category correction leaves ``qualityOutsideFocus`` set on the document; the digest
    applies the same check, so a corrected proposal must not read as "di luar fokus" here.
    """
    return bool(p.get("qualityOutsideFocus")) and p.get("effectiveCategory") == "tidak_cocok"


def _summary(p: dict) -> dict:
    """The one-line view of a proposal used by list-style tools."""
    profile = p.get("profile") or {}
    eff = p.get("effectiveCategory")
    row = {
        "id": p["id"],
        "nama": p.get("name"),
        "skor": _score(p),
        "kategori": CATEGORY_LABEL.get(eff, eff),
        "sektor": profile.get("sector"),
        "tahap": profile.get("stage"),
        "danaDiminta": profile.get("fundingAskIdr"),
        "ringkas": _cut(profile.get("oneLiner"), 140),
        "status": STATUS_LABEL.get(p.get("status"), p.get("status")),
        "tanggapan": (p.get("response") or {}).get("kind") or "belum ditanggapi",
    }
    if _quality_outside_focus(p):
        row["berkualitasDiLuarFokus"] = True
    if p.get("correction"):
        row["kategoriAsliAI"] = CATEGORY_LABEL.get(p.get("category"), p.get("category"))
    return {k: v for k, v in row.items() if v is not None}


def _filter(
    proposals: list[dict],
    *,
    category: Optional[str] = None,
    sector: Optional[str] = None,
    stage: Optional[str] = None,
    responded: Optional[bool] = None,
    quality_outside_focus: Optional[bool] = None,
    status: Optional[str] = None,
    min_score: Optional[float] = None,
) -> list[dict]:
    cat = _norm_category(category)
    st = _norm_status(status)
    sector_q = (sector or "").strip().lower()
    stage_q = (stage or "").strip().lower()
    out = []
    for p in proposals:
        profile = p.get("profile") or {}
        if cat and p.get("effectiveCategory") != cat:
            continue
        if st and p.get("status") != st:
            continue
        if sector_q and sector_q not in (profile.get("sector") or "").lower():
            continue
        if stage_q and stage_q not in (profile.get("stage") or "").lower():
            continue
        if responded is not None and bool(p.get("responded")) != responded:
            continue
        if quality_outside_focus is not None and _quality_outside_focus(p) != quality_outside_focus:
            continue
        if min_score is not None and (_score(p) is None or _score(p) < min_score):
            continue
        out.append(p)
    return out


def _resolve(name_or_id: str, proposals: Optional[list[dict]] = None) -> dict:
    """Find one proposal by id, exact name, or unique name prefix (case-insensitive)."""
    q = (name_or_id or "").strip()
    if not q:
        return {"error": "nama proposal kosong"}
    direct = store.get_proposal(q) if "/" not in q else None
    if direct:
        return {"proposal": direct}
    if proposals is None:
        proposals = store.list_proposals()
    ql = q.lower()

    def lower_name(p: dict) -> str:
        return (p.get("nameLower") or p.get("name") or "").lower()

    exact = [p for p in proposals if lower_name(p) == ql]
    if len(exact) == 1:
        return {"proposal": exact[0]}
    matches = exact or [p for p in proposals if lower_name(p).startswith(ql)]
    if len(matches) == 1:
        return {"proposal": matches[0]}
    if not matches:
        return {"error": f"proposal '{q}' tidak ditemukan di data AISA"}
    return {
        "error": f"nama '{q}' cocok dengan beberapa proposal; minta manajer memperjelas",
        "kandidat": [{"id": p["id"], "nama": p.get("name")} for p in matches[:10]],
    }


def search_proposals(
    category: Optional[str] = None,
    sector: Optional[str] = None,
    stage: Optional[str] = None,
    responded: Optional[bool] = None,
    quality_outside_focus: Optional[bool] = None,
    status: Optional[str] = None,
    min_score: Optional[float] = None,
    limit: int = 10,
) -> dict:
    """Cari proposal di data AISA, diurutkan dari skor kualitas tertinggi.

    Args:
        category: Kategori efektif (sudah memperhitungkan koreksi manajer): sangat_cocok, cocok,
            kurang_cocok, atau tidak_cocok.
        sector: Sektor, dicocokkan sebagian dan tanpa beda huruf besar/kecil (mis. "fintech").
        stage: Tahap pendanaan, dicocokkan sebagian (mis. "seed").
        responded: true = sudah ditanggapi (undang/pantau/arsipkan), false = belum ditanggapi.
        quality_outside_focus: true = hanya yang bertanda "Berkualitas, di luar fokus".
        status: antre, dinilai_proses, dinilai, perlu_dicek_manual, atau dihentikan.
        min_score: Skor kualitas minimal (0-100).
        limit: Jumlah maksimal hasil (default 10, maks 25).
    """
    try:
        rows = _filter(
            store.list_proposals(),
            category=category,
            sector=sector,
            stage=stage,
            responded=responded,
            quality_outside_focus=quality_outside_focus,
            status=status,
            min_score=min_score,
        )
    except ValueError as e:
        return {"error": str(e)}
    rows.sort(key=lambda p: (_score(p) is not None, _score(p) or 0), reverse=True)
    limit = max(1, min(int(limit or 10), LIMIT_MAX))
    return {
        "totalCocok": len(rows),
        "ditampilkan": min(len(rows), limit),
        "proposal": [_summary(p) for p in rows[:limit]],
    }


def count_proposals(
    group_by: str = "category",
    category: Optional[str] = None,
    sector: Optional[str] = None,
    responded: Optional[bool] = None,
    status: Optional[str] = None,
) -> dict:
    """Hitung jumlah proposal, dikelompokkan menurut satu atribut.

    Args:
        group_by: category (kategori efektif), sector, stage, status, response (jenis tanggapan),
            atau outside_focus (tanda berkualitas di luar fokus).
        category: Filter kategori efektif sebelum dihitung (opsional).
        sector: Filter sektor sebelum dihitung (opsional).
        responded: Filter sudah (true) / belum (false) ditanggapi (opsional).
        status: Filter status proposal (opsional).
    """
    if group_by not in GROUP_FIELDS:
        return {"error": f"group_by harus salah satu dari: {', '.join(GROUP_FIELDS)}"}
    try:
        rows = _filter(
            store.list_proposals(), category=category, sector=sector, responded=responded, status=status
        )
    except ValueError as e:
        return {"error": str(e)}
    counts: dict[str, int] = {}
    for p in rows:
        profile = p.get("profile") or {}
        if group_by == "category":
            k = CATEGORY_LABEL.get(p.get("effectiveCategory"), "tanpa kategori (belum/tidak dinilai)")
        elif group_by == "sector":
            k = (profile.get("sector") or "tidak disebut").lower()
        elif group_by == "stage":
            k = (profile.get("stage") or "tidak disebut").lower()
        elif group_by == "status":
            k = STATUS_LABEL.get(p.get("status"), p.get("status") or "-")
        elif group_by == "response":
            k = (p.get("response") or {}).get("kind") or "belum ditanggapi"
        else:
            k = "berkualitas di luar fokus" if _quality_outside_focus(p) else "lainnya"
        counts[k] = counts.get(k, 0) + 1
    return {"total": len(rows), "per": group_by, "jumlah": dict(sorted(counts.items(), key=lambda kv: -kv[1]))}


def _detail(p: dict) -> dict:
    a = p.get("assessment") or {}
    criteria = {}
    for key, c in (a.get("criteria") or {}).items():
        criteria[CRITERION_LABEL.get(key, key)] = {
            "nilai": c.get("value"),
            "tidakDisebut": bool(c.get("notMentioned")),
            "alasan": _cut(c.get("reason")),
            "kutipan": [
                {"hal": q.get("page"), "kutipan": _cut(q.get("quote"), QUOTE_MAX)}
                for q in (c.get("citations") or [])[:3]
            ],
        }
    fit = p.get("fit")
    out = {
        **_summary(p),
        "jumlahHalaman": p.get("pageCount"),
        "alasanStatus": p.get("statusReason"),
        "skorDetail": {
            "skor": a.get("score"),
            "versiAturan": a.get("rulesVersion"),
            "model": a.get("model"),
            "kriteria": criteria,
        }
        if a
        else None,
        "cekKecocokan": {
            "lulus": fit.get("passed"),
            "butir": {
                k: {"lulus": v.get("passed"), "alasan": _cut(v.get("reason"))}
                for k, v in (fit.get("checks") or {}).items()
            },
        }
        if fit
        else None,
        "koreksi": {
            "ke": CATEGORY_LABEL.get((p.get("correction") or {}).get("category")),
            "alasan": _cut((p.get("correction") or {}).get("reason")),
            "pada": (p.get("correction") or {}).get("at"),
            "via": (p.get("correction") or {}).get("via"),
        }
        if p.get("correction")
        else None,
        "tanggapanDetail": {k: _cut(v) for k, v in (p.get("response") or {}).items()} or None,
        "masuk": p.get("createdAt"),
        "dinilaiPada": p.get("assessedAt"),
    }
    return store.plain({k: v for k, v in out.items() if v is not None})


def get_proposal_detail(name_or_id: str) -> dict:
    """Ambil detail satu proposal: nilai tiap kriteria beserta alasan dan kutipan halaman,
    hasil cek kecocokan, koreksi kategori, dan tanggapan manajer. Kontak founder tidak pernah
    disertakan.

    Args:
        name_or_id: Nama startup (tanpa beda huruf besar/kecil, awalan yang unik juga boleh)
            atau ID proposal.
    """
    found = _resolve(name_or_id)
    if "error" in found:
        return found
    return _detail(found["proposal"])


def compare_proposals(names: list[str]) -> dict:
    """Bandingkan 2-4 proposal berdampingan: skor, nilai per kriteria, kategori, cek kecocokan.

    Args:
        names: Daftar nama startup atau ID proposal yang dibandingkan.
    """
    if not names or len(names) < 2:
        return {"error": "sebutkan minimal dua proposal untuk dibandingkan"}
    proposals = store.list_proposals()
    rows, errors = [], []
    for n in names[:4]:
        found = _resolve(n, proposals)
        if "error" in found:
            errors.append(found)
            continue
        p = found["proposal"]
        crit = (p.get("assessment") or {}).get("criteria") or {}
        fit = p.get("fit") or {}
        rows.append(
            {
                **_summary(p),
                "nilaiKriteria": {
                    CRITERION_LABEL.get(k, k): {
                        "nilai": c.get("value"),
                        "alasan": _cut(c.get("reason"), 120),
                        "hal": [q.get("page") for q in (c.get("citations") or [])][:3],
                    }
                    for k, c in crit.items()
                },
                "lulusCekKecocokan": fit.get("passed"),
                "gagalCek": [k for k, v in (fit.get("checks") or {}).items() if not v.get("passed")],
            }
        )
    out: dict = {"perbandingan": store.plain(rows)}
    if errors:
        out["tidakDitemukan"] = errors
    return out


def get_history(proposal: Optional[str] = None, limit: int = 10) -> dict:
    """Ambil Riwayat (jejak audit): tanggapan, koreksi kategori, perubahan aturan, ringkasan
    terkirim, STOP/LANJUT. Tanpa `proposal`, mengembalikan riwayat terbaru.

    Args:
        proposal: Nama atau ID proposal (opsional).
        limit: Jumlah baris maksimal (default 10, maks 25).
    """
    limit = max(1, min(int(limit or 10), LIMIT_MAX))
    if proposal:
        found = _resolve(proposal)
        if "error" in found:
            return found
        rows = store.history_for(found["proposal"]["id"])[:limit]
    else:
        rows = store.recent_history(limit)
    keep = ("at", "via", "action", "proposalName", "before", "after", "reason", "detail")
    compact = [{k: _cut(r.get(k), 160) for k in keep if r.get(k) is not None} for r in rows]
    return {"riwayat": store.plain(compact)}


def get_trends(days: int = 7) -> dict:
    """Tren proposal dari statistik harian (tanggal WIB): jumlah masuk per hari, per kategori,
    per sektor, dan perbandingan dengan periode sebelumnya yang sama panjang.

    Args:
        days: Panjang periode dalam hari (default 7, maks 90).
    """
    days = max(1, min(int(days or 7), 90))
    today = store.today_wib()
    current = [today - timedelta(days=i) for i in range(days)]
    previous = [today - timedelta(days=days + i) for i in range(days)]
    stats = store.daily_stats(current + previous)

    def total(dates):
        agg = {"proposalMasuk": 0, "perluDicekManual": 0, "perKategori": {}, "perSektor": {}}
        for d in dates:
            s = stats.get(d.isoformat())
            if not s:
                continue
            agg["proposalMasuk"] += s.get("proposalsIn") or 0
            agg["perluDicekManual"] += s.get("perluDicekManual") or 0
            for k, v in (s.get("byCategory") or {}).items():
                label = CATEGORY_LABEL.get(k, k)
                agg["perKategori"][label] = agg["perKategori"].get(label, 0) + (v or 0)
            for k, v in (s.get("bySector") or {}).items():
                agg["perSektor"][k] = agg["perSektor"].get(k, 0) + (v or 0)
        return agg

    cur, prev = total(current), total(previous)
    if not any(d.isoformat() in stats for d in current):
        return {"error": f"tidak ada statistik harian untuk {days} hari terakhir"}

    def change(now: int, before: int):
        return None if not before else round((now - before) * 100 / before, 1)

    sectors = {
        k: {"sekarang": v, "sebelumnya": prev["perSektor"].get(k, 0), "perubahanPersen": change(v, prev["perSektor"].get(k, 0))}
        for k, v in sorted(cur["perSektor"].items(), key=lambda kv: -kv[1])[:10]
    }
    return {
        "periode": f"{current[-1].isoformat()} s.d. {today.isoformat()} ({days} hari)",
        "periodeSebelumnya": f"{previous[-1].isoformat()} s.d. {previous[0].isoformat()}",
        "harian": [
            {"tanggal": d.isoformat(), "masuk": (stats.get(d.isoformat()) or {}).get("proposalsIn", 0)}
            for d in reversed(current)
        ],
        "sekarang": {k: v for k, v in cur.items() if k != "perSektor"},
        "sebelumnya": {k: v for k, v in prev.items() if k != "perSektor"},
        "perubahanMasukPersen": change(cur["proposalMasuk"], prev["proposalMasuk"]),
        "sektorTeratas": sectors,
    }


def get_rules() -> dict:
    """Aturan penilaian yang aktif: bobot kriteria, aturan cek kecocokan (sektor, tahap, rentang
    dana), batas kategori, versi, dan alasan perubahan terakhir."""
    r = store.get_doc("settings/rules")
    if not r:
        return {"error": "aturan penilaian tidak tersedia di data AISA"}
    out = {
        "versi": r.get("version"),
        "bobot": {CRITERION_LABEL.get(k, k): v for k, v in (r.get("weights") or {}).items()},
        "cekKecocokan": r.get("fit"),
        "batasKategori": r.get("thresholds"),
        "patokanNilai": {
            CRITERION_LABEL.get(k, k): {str(n): _cut(t, 120) for n, t in (v or {}).items()}
            for k, v in (r.get("anchors") or {}).items()
        },
        "diubahPada": r.get("changedAt"),
        "alasanPerubahan": _cut(r.get("reason")),
    }
    return store.plain({k: v for k, v in out.items() if v is not None})


def _safe(fn):
    """A failed Firestore read must come back as a tool result the agent can explain,
    not as an exception that aborts the manager's whole turn."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001
            log.exception("tool %s failed", fn.__name__)
            return {"error": f"data AISA sedang tidak bisa dibaca ({type(e).__name__}); coba lagi nanti"}

    return wrapper


ALL_TOOLS = [
    _safe(fn)
    for fn in (
        search_proposals,
        count_proposals,
        get_proposal_detail,
        compare_proposals,
        get_history,
        get_trends,
        get_rules,
    )
]
