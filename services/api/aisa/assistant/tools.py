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

# Grades, best first. This package is deployed alone, so it keeps its own copy of the
# labels in aisa.models (CATEGORY_LABEL, CATEGORY_ACTION); a test holds the two equal.
CATEGORY_LABEL = {
    "sangat_layak": "Sangat layak",
    "layak_bersyarat": "Layak bersyarat",
    "perlu_penyesuaian": "Perlu penyesuaian",
    "risiko_tinggi": "Risiko tinggi",
    "tidak_layak": "Tidak layak",
}
CATEGORY_ACTION = {
    "sangat_layak": "Lanjutkan investasi",
    "layak_bersyarat": "Investasi dengan syarat",
    "perlu_penyesuaian": "Sesuaikan dulu sebelum lanjut",
    "risiko_tinggi": "Pertimbangkan menolak",
    "tidak_layak": "Tolak",
}
CATEGORY_RANK = {k: i for i, k in enumerate(CATEGORY_LABEL)}
# A–E order.
CRITERION_LABEL = {
    "manajemen": "A. Tim manajemen",
    "kinerja": "B. Kinerja bisnis saat ini",
    "risiko": "C. Risiko bisnis & tren makro",
    "rencana": "D. Rencana bisnis & potensi imbal hasil",
    "dampak": "E. Potensi dampak",
}
NO_GRADE = "tanpa grade (belum/tidak dinilai)"
OUT_OF_FOCUS_MEANING = ("prioritas rendah: tidak sesuai fokus investasi (sektor/tahap/dana), "
                        "jadi risikonya lebih tinggi untuk portofolio")
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
# A list answer ("sebutkan semua yang ...") may need more rows than a history page.
SEARCH_LIMIT_MAX = 50
OVERVIEW_MAX = 50


def _cut(text: object, n: int = TEXT_MAX) -> object:
    if isinstance(text, str) and len(text) > n:
        return text[: n - 1].rstrip() + "…"
    return text


def _key(value: Optional[str]) -> str:
    return (value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _norm_category(value: Optional[str]) -> Optional[str]:
    """A grade value ("layak_bersyarat") or its label in any case/spacing ("Layak bersyarat")."""
    if not value:
        return None
    k = _key(value)
    if k in CATEGORY_LABEL:
        return k
    raise ValueError(
        f"grade '{value}' tidak dikenal; pilih salah satu: {', '.join(CATEGORY_LABEL)}"
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


def _outside_focus(p: dict) -> bool:
    """"Di luar fokus" is a failed fit check (`fit.passed` false); it never changes the grade."""
    return (p.get("fit") or {}).get("passed") is False


def _rank(p: dict) -> tuple:
    """Ranking everywhere proposals are listed: grade, then in-focus first, then score."""
    score = _score(p)
    return (CATEGORY_RANK.get(p.get("effectiveCategory"), len(CATEGORY_RANK)),
            _outside_focus(p), score is None, -(score or 0))


def _summary(p: dict) -> dict:
    """The one-line view of a proposal used by list-style tools."""
    profile = p.get("profile") or {}
    eff = p.get("effectiveCategory")
    row = {
        "id": p["id"],
        "nama": p.get("name"),
        "skor": _score(p),
        "grade": CATEGORY_LABEL.get(eff, eff),
        "aksi": CATEGORY_ACTION.get(eff),
        "sektor": profile.get("sector"),
        "tahap": profile.get("stage"),
        "danaDiminta": profile.get("fundingAskIdr"),
        "ringkas": _cut(profile.get("oneLiner"), 140),
        "status": STATUS_LABEL.get(p.get("status"), p.get("status")),
        "tanggapan": (p.get("response") or {}).get("kind") or "belum ditanggapi",
    }
    if _outside_focus(p):
        row["diLuarFokus"] = True
    if p.get("correction"):
        row["gradeAsliAI"] = CATEGORY_LABEL.get(p.get("category"), p.get("category"))
    return {k: v for k, v in row.items() if v is not None}


def _filter(
    proposals: list[dict],
    *,
    category: Optional[str] = None,
    sector: Optional[str] = None,
    stage: Optional[str] = None,
    responded: Optional[bool] = None,
    outside_focus: Optional[bool] = None,
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
        if outside_focus is not None and _outside_focus(p) != outside_focus:
            continue
        if min_score is not None and (_score(p) is None or _score(p) < min_score):
            continue
        out.append(p)
    return out


def _funding(p: dict) -> int | None:
    return (p.get("profile") or {}).get("fundingAskIdr")


def _by_funding(
    proposals: list[dict], min_idr: int | None, max_idr: int | None
) -> tuple[list[dict], dict]:
    """Apply a funding range (both ends inclusive). A proposal whose deck names no amount
    cannot be placed on either side of a bound, so it is left out of the result and its
    count is returned as `danaTidakDisebut` rather than dropped silently."""
    if min_idr is None and max_idr is None:
        return proposals, {}
    kept, unknown = [], 0
    for p in proposals:
        f = _funding(p)
        if f is None:
            unknown += 1
        elif (min_idr is None or f >= min_idr) and (max_idr is None or f <= max_idr):
            kept.append(p)
    return kept, {"danaTidakDisebut": unknown}


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


def _overview_row(p: dict) -> dict:
    eff = p.get("effectiveCategory")
    row = {
        "nama": p.get("name"),
        "sektor": (p.get("profile") or {}).get("sector"),
        "danaDiminta": _funding(p),
        "skor": _score(p),
        "grade": CATEGORY_LABEL.get(eff, eff),
        "aksi": CATEGORY_ACTION.get(eff),
        "status": STATUS_LABEL.get(p.get("status"), p.get("status")),
        "tanggapan": (p.get("response") or {}).get("kind") or "belum",
    }
    if _outside_focus(p):
        row["diLuarFokus"] = True
    return {k: v for k, v in row.items() if v is not None}


def get_overview() -> dict:
    """Gambaran ringkas SEMUA proposal dalam satu panggilan: jumlah per grade efektif, jumlah
    di luar fokus, jumlah belum ditanggapi, dan satu baris per proposal (nama, sektor,
    danaDiminta dalam rupiah bila disebut, skor kualitas, grade efektif, aksi, status,
    tanggapan, diLuarFokus), urut menurut grade, lalu yang sesuai fokus dulu, lalu skor
    tertinggi, maksimal 50 baris. Pakai ini untuk pertanyaan umum ("ringkas semua proposal",
    "bagaimana kondisi proposal", "mana yang menonjol")."""
    proposals = store.list_proposals()
    proposals.sort(key=_rank)
    per_grade: dict[str, int] = {}
    for p in proposals:
        k = CATEGORY_LABEL.get(p.get("effectiveCategory"), NO_GRADE)
        per_grade[k] = per_grade.get(k, 0) + 1
    return {
        "total": len(proposals),
        "belumDitanggapi": sum(1 for p in proposals if not p.get("responded")),
        "perGrade": per_grade,
        "diLuarFokus": sum(1 for p in proposals if _outside_focus(p)),
        "artiDiLuarFokus": OUT_OF_FOCUS_MEANING,
        "ditampilkan": min(len(proposals), OVERVIEW_MAX),
        "proposal": [_overview_row(p) for p in proposals[:OVERVIEW_MAX]],
    }


def search_proposals(
    category: Optional[str] = None,
    sector: Optional[str] = None,
    stage: Optional[str] = None,
    responded: Optional[bool] = None,
    outside_focus: Optional[bool] = None,
    status: Optional[str] = None,
    min_score: Optional[float] = None,
    min_funding_idr: int | None = None,
    max_funding_idr: int | None = None,
    limit: int = 10,
) -> dict:
    """Cari proposal di data AISA, diurutkan menurut grade, lalu yang sesuai fokus dulu, lalu
    skor kualitas tertinggi.

    Args:
        category: Grade efektif (sudah memperhitungkan koreksi manajer): sangat_layak,
            layak_bersyarat, perlu_penyesuaian, risiko_tinggi, atau tidak_layak.
        sector: Sektor, dicocokkan sebagian dan tanpa beda huruf besar/kecil (mis. "fintech").
        stage: Tahap pendanaan, dicocokkan sebagian (mis. "seed").
        responded: true = sudah ditanggapi (undang/pantau/arsipkan), false = belum ditanggapi.
        outside_focus: true = hanya yang di luar fokus investasi (gagal cek sektor, tahap,
            atau dana); false = hanya yang sesuai fokus. Di luar fokus tidak mengubah grade.
        status: antre, dinilai_proses, dinilai, perlu_dicek_manual, atau dihentikan.
        min_score: Skor kualitas minimal (0-100).
        min_funding_idr: Dana diminta minimal, dalam rupiah penuh, termasuk nilai itu sendiri
            (mis. 3000000000 untuk "minimal Rp3 M"; "lebih dari Rp10 M" = 10000000001).
        max_funding_idr: Dana diminta maksimal, dalam rupiah penuh, termasuk nilai itu sendiri
            (mis. "di bawah Rp3 M" = 2999999999; "paling banyak Rp3 M" = 3000000000).
            Dengan filter dana, proposal yang tidak menyebut dana tidak ikut dan jumlahnya
            dilaporkan di `danaTidakDisebut`.
        limit: Jumlah maksimal hasil (default 10, maks 50). Untuk daftar lengkap, isi sebesar
            totalCocok yang diharapkan.
    """
    try:
        rows = _filter(
            store.list_proposals(),
            category=category,
            sector=sector,
            stage=stage,
            responded=responded,
            outside_focus=outside_focus,
            status=status,
            min_score=min_score,
        )
    except ValueError as e:
        return {"error": str(e)}
    rows, unknown = _by_funding(rows, min_funding_idr, max_funding_idr)
    rows.sort(key=_rank)
    limit = max(1, min(int(limit or 10), SEARCH_LIMIT_MAX))
    return {
        "totalCocok": len(rows),
        **unknown,
        "ditampilkan": min(len(rows), limit),
        "proposal": [_summary(p) for p in rows[:limit]],
    }


def count_proposals(
    group_by: str = "category",
    category: Optional[str] = None,
    sector: Optional[str] = None,
    responded: Optional[bool] = None,
    status: Optional[str] = None,
    min_funding_idr: int | None = None,
    max_funding_idr: int | None = None,
) -> dict:
    """Hitung jumlah proposal, dikelompokkan menurut satu atribut.

    Args:
        group_by: category (grade efektif), sector, stage, status, response (jenis tanggapan),
            atau outside_focus (di luar fokus investasi atau sesuai fokus).
        category: Filter grade efektif sebelum dihitung (opsional).
        sector: Filter sektor sebelum dihitung (opsional).
        responded: Filter sudah (true) / belum (false) ditanggapi (opsional).
        status: Filter status proposal (opsional).
        min_funding_idr: Dana diminta minimal dalam rupiah penuh, inklusif (opsional; lihat
            search_proposals).
        max_funding_idr: Dana diminta maksimal dalam rupiah penuh, inklusif (opsional). Dengan
            filter dana, proposal tanpa dana tidak dihitung di `total` dan jumlahnya ada di
            `danaTidakDisebut`.
    """
    if group_by not in GROUP_FIELDS:
        return {"error": f"group_by harus salah satu dari: {', '.join(GROUP_FIELDS)}"}
    try:
        rows = _filter(
            store.list_proposals(), category=category, sector=sector, responded=responded, status=status
        )
    except ValueError as e:
        return {"error": str(e)}
    rows, unknown = _by_funding(rows, min_funding_idr, max_funding_idr)
    counts: dict[str, int] = {}
    for p in rows:
        profile = p.get("profile") or {}
        if group_by == "category":
            k = CATEGORY_LABEL.get(p.get("effectiveCategory"), NO_GRADE)
        elif group_by == "sector":
            k = (profile.get("sector") or "tidak disebut").lower()
        elif group_by == "stage":
            k = (profile.get("stage") or "tidak disebut").lower()
        elif group_by == "status":
            k = STATUS_LABEL.get(p.get("status"), p.get("status") or "-")
        elif group_by == "response":
            k = (p.get("response") or {}).get("kind") or "belum ditanggapi"
        else:
            k = "di luar fokus" if _outside_focus(p) else "sesuai fokus"
        counts[k] = counts.get(k, 0) + 1
    return {"total": len(rows), **unknown, "per": group_by,
            "jumlah": dict(sorted(counts.items(), key=lambda kv: -kv[1]))}


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
    """Ambil detail satu proposal: nilai tiap kriteria (A-E) beserta alasan dan kutipan halaman,
    hasil cek kecocokan (fokus), koreksi grade, dan tanggapan manajer. Kontak founder tidak pernah
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
    """Bandingkan 2-4 proposal berdampingan: skor, nilai per kriteria, grade, cek kecocokan.

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
    """Ambil Riwayat (jejak audit): tanggapan, koreksi grade, penilaian ulang, perubahan aturan,
    ringkasan terkirim, STOP/LANJUT. Nilai lama sangat_cocok/cocok/kurang_cocok/tidak_cocok di
    riwayat berasal dari skala lama. Tanpa `proposal`, mengembalikan riwayat terbaru.

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
    """Tren proposal dari statistik harian (tanggal WIB): jumlah masuk per hari, per grade,
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
        agg = {"proposalMasuk": 0, "perluDicekManual": 0, "perGrade": {}, "perSektor": {}}
        for d in dates:
            s = stats.get(d.isoformat())
            if not s:
                continue
            agg["proposalMasuk"] += s.get("proposalsIn") or 0
            agg["perluDicekManual"] += s.get("perluDicekManual") or 0
            for k, v in (s.get("byCategory") or {}).items():
                label = CATEGORY_LABEL.get(k, k)
                agg["perGrade"][label] = agg["perGrade"].get(label, 0) + (v or 0)
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
    """Aturan penilaian yang aktif: bobot kriteria A-E, aturan cek kecocokan (sektor, tahap,
    rentang dana), skor minimal tiap grade, versi, dan alasan perubahan terakhir."""
    r = store.get_doc("settings/rules")
    if not r:
        return {"error": "aturan penilaian tidak tersedia di data AISA"}
    out = {
        "versi": r.get("version"),
        "bobot": {CRITERION_LABEL.get(k, k): v for k, v in (r.get("weights") or {}).items()},
        "cekKecocokan": r.get("fit"),
        "skorMinimalGrade": _grade_bands(r.get("thresholds") or {}),
        "patokanNilai": {
            CRITERION_LABEL.get(k, k): {str(n): _cut(t, 120) for n, t in (v or {}).items()}
            for k, v in (r.get("anchors") or {}).items()
        },
        "diubahPada": r.get("changedAt"),
        "alasanPerubahan": _cut(r.get("reason")),
    }
    return store.plain({k: v for k, v in out.items() if v is not None})


THRESHOLD_KEYS = {"sangatLayak": "sangat_layak", "layakBersyarat": "layak_bersyarat",
                  "perluPenyesuaian": "perlu_penyesuaian", "risikoTinggi": "risiko_tinggi"}


def _grade_bands(t: dict) -> dict:
    """{grade label: minimum score}; Tidak layak is everything below Risiko tinggi."""
    out = {CATEGORY_LABEL[g]: t[k] for k, g in THRESHOLD_KEYS.items() if k in t}
    if "risikoTinggi" in t:
        out[CATEGORY_LABEL["tidak_layak"]] = f"di bawah {t['risikoTinggi']}"
    return out


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
        get_overview,
        search_proposals,
        count_proposals,
        get_proposal_detail,
        compare_proposals,
        get_history,
        get_trends,
        get_rules,
    )
]
