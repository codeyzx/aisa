"""Operator CLI: `uv run aisa seed-rules | intake-file <pdf> [--name N] | digest <slot> [--send]`."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import db


def seed_rules() -> None:
    from .jobs import write_history
    from .models import Via, default_rules, to_doc

    ref = db.client().document("settings/rules")
    if ref.get().exists:
        print("settings/rules sudah ada; tidak diubah")
        return
    rules = default_rules(db.now())
    doc = to_doc(rules)
    ref.create(doc)
    db.client().document(f"rulesVersions/{rules.version}").set(doc)
    write_history(via=Via.sistem, action="aturan_diubah", after=rules.version, reason=rules.reason,
                  detail="Aturan penilaian awal (versi 1) dibuat")
    print("settings/rules versi 1 ditulis")


def main() -> None:
    ap = argparse.ArgumentParser(prog="aisa")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed-rules")
    f = sub.add_parser("intake-file", help="register and assess a local PDF as an upload (no GCS)")
    f.add_argument("pdf")
    f.add_argument("--name")
    d = sub.add_parser("digest")
    d.add_argument("slot", choices=["09.00", "17.00"])
    d.add_argument("--send", action="store_true", help="really send via GOWA and record it")
    a = ap.parse_args()

    if a.cmd == "seed-rules":
        seed_rules()
    elif a.cmd == "intake-file":
        from . import intake
        from .models import Founder, Source, SourceKind

        pdf = Path(a.pdf).read_bytes()
        pid = intake.upload_id(pdf)
        created = intake.register(pid, Source(kind=SourceKind.upload, fileName=Path(a.pdf).name),
                                  a.name, Founder(), consent=True)
        status = intake.run_intake(pid, pdf)
        print(json.dumps({"proposalId": pid, "created": created, "status": status}))
    elif a.cmd == "digest":
        from .digest import run_digest

        print(json.dumps(run_digest(a.slot, send=a.send), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
