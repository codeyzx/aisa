"""`aisa migrate-anchors`: write the default text of levels 2 and 4 into a stored rules doc
that predates them.

Dry-run by default: it reads `settings/rules` and prints, per criterion, which of "2" and "4"
`--apply` would fill, with no write. `--apply` fills only a level that is missing or blank,
taking the text from `DEFAULT_ANCHORS`; a level that already has text (the investor's own) is
never touched. The save goes through `domain.update_rules`, so it bumps the version and writes
`settings/rules`, `rulesVersions/{v}` and one `aturan_diubah` history row (`via: sistem`), as a
save from the dashboard does. Running it again finds every level present and writes nothing."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from . import db
from .domain import update_rules
from .models import DEFAULT_ANCHORS, Criterion, Via, anchors_complete

FILLED_LEVELS = (("2", "two"), ("4", "four"))
REASON = "Lengkapi patokan skor 2 dan 4 dari baseline"
# Set by update_rules on every save; carrying the stored values over would be misleading.
_SET_ON_SAVE = ("version", "changedAt", "reason")


def plan(anchors: dict[str, Any]) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """(the anchors with each missing or blank "2"/"4" of a known criterion filled from the
    default, {criterion: [filled levels]}). Every other text is kept as stored."""
    out: dict[str, Any] = {}
    filled: dict[str, list[str]] = {}
    for key, a in anchors.items():
        if isinstance(a, dict) and key in {c.value for c in Criterion}:
            a = dict(a)
            default = DEFAULT_ANCHORS[Criterion(key)]
            for level, name in FILLED_LEVELS:
                if not (isinstance(a.get(level), str) and a[level].strip()):
                    a[level] = getattr(default, name)
                    filled.setdefault(key, []).append(level)
        out[key] = a
    return out, filled


def migrate(apply: bool = False, out: Callable[[str], None] = print) -> dict[str, Any]:
    mode = "MENJALANKAN" if apply else "RENCANA (dry-run: tidak ada yang ditulis)"
    out(f"migrate-anchors: {mode}")

    snap = db.client().document("settings/rules").get()
    if not snap.exists:
        out("settings/rules belum ada; jalankan `aisa seed-rules` dulu. Tidak ada yang ditulis.")
        return {"apply": apply, "diisi": {}, "versi": None}
    raw = snap.to_dict() or {}
    anchors, filled = plan(raw.get("anchors") or {})

    if not filled:
        out(f"Patokan skor 1–5 sudah lengkap di aturan versi {raw.get('version')}; "
            "tidak ada yang diubah.")
        return {"apply": apply, "diisi": {}, "versi": raw.get("version")}
    for key, levels in sorted(filled.items()):
        out(f"  - {key}: patokan {' dan '.join(levels)} diisi dari baseline")
    if not anchors_complete(anchors):
        # A missing criterion or a blank 1/3/5 is not ours to invent; update_rules would refuse.
        out("Patokan tetap tidak lengkap setelah diisi (kriteria hilang atau nilai 1/3/5 kosong); "
            "perbaiki lewat halaman Aturan. Tidak ada yang ditulis.")
        return {"apply": apply, "diisi": filled, "versi": raw.get("version"), "lengkap": False}
    if not apply:
        out("Tidak ada yang ditulis. Jalankan dengan --apply untuk menjalankannya.")
        return {"apply": apply, "diisi": filled, "versi": raw.get("version")}

    new = {k: v for k, v in raw.items() if k not in _SET_ON_SAVE}
    rules = update_rules({**new, "anchors": anchors}, REASON, Via.sistem)
    out(f"Aturan disimpan sebagai versi {rules.version}.")
    return {"apply": apply, "diisi": filled, "versi": rules.version}
