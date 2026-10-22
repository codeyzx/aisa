"""Operator CLI: `uv run aisa seed-rules | intake-file <pdf> [--name N] | digest <slot> [--send]
| delete-proposal <id> --reason R | retention | migrate-grades [--apply]
| migrate-responses [--apply] | migrate-anchors [--apply] | seed-demo [--remove] [--apply]`."""

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
    x = sub.add_parser("delete-proposal", help="delete a proposal and its data (history is scrubbed)")
    x.add_argument("proposal_id")
    x.add_argument("--reason", required=True)
    sub.add_parser("retention", help="delete `tolak` proposals past rules.retentionDays now")
    m = sub.add_parser("migrate-grades",
                       help="move rules and assessed proposals to the A–E criteria and 5 grades")
    m.add_argument("--apply", action="store_true",
                   help="really re-assess and write; without it, only print the plan")
    r = sub.add_parser("migrate-responses",
                       help="move undang/pantau/arsipkan decisions to setuju/tolak")
    r.add_argument("--apply", action="store_true",
                   help="really write; without it, only print the plan")
    n = sub.add_parser("migrate-anchors",
                       help="fill missing rubric levels 2 and 4 from the defaults, keeping stored text")
    n.add_argument("--apply", action="store_true",
                   help="really write; without it, only print the plan")
    s = sub.add_parser("seed-demo",
                       help="write (or with --remove, delete) the fictional demo-* dataset")
    s.add_argument("--remove", action="store_true",
                   help="delete every demo-* doc and subtract its dailyStats contribution")
    s.add_argument("--apply", action="store_true",
                   help="really write or delete; without it, only print the plan")
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
    elif a.cmd == "delete-proposal":
        from .domain import DomainError, delete_proposal
        from .models import Via

        try:
            print(json.dumps(delete_proposal(a.proposal_id, a.reason, Via.sistem)))
        except DomainError as e:
            raise SystemExit(f"gagal: {e}") from e
    elif a.cmd == "retention":
        from .retention import run

        print(json.dumps(run(), ensure_ascii=False))
    elif a.cmd == "migrate-grades":
        from .migrate_grades import migrate

        migrate(apply=a.apply)
    elif a.cmd == "migrate-responses":
        from .migrate_responses import migrate as migrate_responses

        migrate_responses(apply=a.apply)
    elif a.cmd == "migrate-anchors":
        from .domain import DomainError
        from .migrate_anchors import migrate as migrate_anchors

        try:
            migrate_anchors(apply=a.apply)
        except DomainError as e:
            raise SystemExit(f"gagal: {e}") from e
    elif a.cmd == "seed-demo":
        from . import seed_demo

        if a.remove:
            seed_demo.remove(apply=a.apply)
        else:
            seed_demo.seed(apply=a.apply)


if __name__ == "__main__":
    main()
