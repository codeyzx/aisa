"""`aisa seed-demo`: the dry run writes nothing; --apply writes demo-* docs that validate against
the models, agree with the live rules and add to dailyStats exactly what they carry; a second
--apply changes nothing; --remove restores every non-demo doc, aggregates included."""

from __future__ import annotations

import copy
from datetime import UTC, datetime

import pytest
from conftest import T0

from aisa import seed_demo
from aisa.models import (
    Category,
    Digest,
    History,
    Job,
    Proposal,
    ProposalText,
    Step,
    default_rules,
    to_doc,
)
from aisa.scoring import categorize, compute_score, fit_check, values_of

NOW = datetime(2026, 10, 22, 5, 0, tzinfo=UTC)  # Thursday 12.00 WIB
YESTERDAY = "2026-10-21"


@pytest.fixture
def world(fs):
    """Real data the demo must leave alone: rules, a proposal, a job, a history row, a digest
    on yesterday's 09.00 slot, and yesterday's dailyStats."""
    rules = default_rules(T0)
    fs.document("settings/rules").set(to_doc(rules))
    fs.document("proposals/form-real1").set({"name": "Asli", "createdAt": T0, "status": "dinilai"})
    fs.document("jobs/penilaian-real").set({"kind": "penilaian", "tokensIn": 9000})
    fs.document("jobs/penilaian-real/steps/001").set({"seq": 1, "actor": "model"})
    fs.document("history/abc").set({"action": "proposal_masuk", "at": T0})
    fs.document(f"digests/{YESTERDAY}-0900").set({"slot": "09.00", "sentAt": T0})
    fs.document(f"dailyStats/{YESTERDAY}").set({
        "date": YESTERDAY, "proposalsIn": 11, "byCategory": {"tidak_layak": 9, "risiko_tinggi": 2},
        "bySector": {"fintech": 4, "f&b": 3}, "perluDicekManual": 0, "tokensIn": 150_000,
        "tokensOut": 30_000, "modelCalls": 20,
        "tokensByKind": {"penilaian": {"in": 150_000, "out": 30_000}}})
    return fs


def run(apply: bool) -> dict:
    return seed_demo.seed(apply=apply, now=NOW, out=lambda _: None)


def demo_paths(fs) -> list[str]:
    return [p for p in fs.docs if any(seg.startswith(seed_demo.PREFIX) for seg in p.split("/"))]


def test_dry_run_writes_nothing(world):
    before = copy.deepcopy(world.docs)
    report = run(apply=False)
    assert world.docs == before
    assert report["proposals"] == seed_demo.GRADED + seed_demo.MANUAL
    assert report["units"] > report["proposals"]


def test_apply_writes_valid_prefixed_docs(world):
    before = copy.deepcopy(world.docs)
    run(apply=True)
    rules = default_rules(T0)

    for path in world.docs:
        if path not in before and not path.startswith("dailyStats/"):
            _coll, doc_id = path.split("/")[:2]
            assert doc_id.startswith(seed_demo.PREFIX), path
    for path, doc in before.items():
        if not path.startswith("dailyStats/"):
            assert world.docs[path] == doc, path

    proposals = world.all("proposals")
    demo = {k: Proposal.model_validate(v) for k, v in proposals.items()
            if k.startswith(seed_demo.PREFIX)}
    assert len(demo) == seed_demo.GRADED + seed_demo.MANUAL
    graded = [p for p in demo.values() if p.status == "dinilai"]
    assert len(graded) == seed_demo.GRADED
    assert {c: sum(p.category == c.value for p in graded) for c in Category} == \
        seed_demo.GRADE_QUOTA
    for pid, p in demo.items():
        assert p.source.kind == "form" and p.source.driveFileId is None and p.source.gcsPath is None
        assert p.founder.email.endswith("@example.id")
        text = ProposalText.model_validate(world.get(f"proposalTexts/{pid}"))
        assert len(text.pages) == p.pageCount
        job = Job.model_validate(world.get(f"jobs/{p.jobId}"))
        assert (job.tokensIn, job.tokensOut) == (p.tokens.in_, p.tokens.out)
        assert job.proposalId == pid
        if p.status != "dinilai":
            assert p.assessment is None and p.category is None
            continue
        score = compute_score(rules.weights, values_of(p.assessment.criteria))
        assert p.assessment.score == score
        assert p.category == categorize(score, rules.thresholds).value
        assert p.fit == fit_check(p.profile, rules.fit)
        assert 500_000_000 <= p.profile.fundingAskIdr <= 25_000_000_000
        hour = p.createdAt.astimezone(seed_demo.db.WIB).hour
        assert 9 <= hour <= 20
        for c in p.assessment.criteria.values():
            if c.value == 1:
                assert c.notMentioned and not c.citations
            else:
                assert c.reason.startswith(f"Nilai {c.value}: ")
                for cit in c.citations:
                    assert cit.quote in text.pages[cit.page - 1]
        if p.response:
            assert p.responded and p.response.at > p.assessedAt
            assert world.get(f"history/{seed_demo.PREFIX}tanggapan-{pid.removeprefix('demo-')}")

    # The score drifts up over the two weeks.
    ordered = sorted(graded, key=lambda p: p.createdAt)
    half = len(ordered) // 2
    mean = lambda ps: sum(p.assessment.score for p in ps) / len(ps)
    assert mean(ordered[half:]) > mean(ordered[:half])

    for path, doc in world.docs.items():
        if path.startswith("jobs/demo-"):
            (Step if "/steps/" in path else Job).model_validate(doc)
        elif path.startswith("history/demo-"):
            History.model_validate(doc)
        elif path.startswith("digests/demo-"):
            Digest.model_validate(doc)
    kinds = {Job.model_validate(d).kind for k, d in world.all("jobs").items() if k.startswith("demo-")}
    assert kinds == {"penilaian", "ringkasan", "asisten"}
    digests = {k: Digest.model_validate(d) for k, d in world.all("digests").items()
               if k.startswith("demo-")}
    assert any(d.period == "mingguan" and d.weekly for d in digests.values())
    # Yesterday already has a real 09.00 digest, so no demo digest is sent in that slot.
    assert not any(d.slot == "09.00" and seed_demo.db.wib_date(d.sentAt) == YESTERDAY
                   for d in digests.values())


def test_daily_stats_match_the_docs(world):
    run(apply=True)
    stats = world.all("dailyStats")
    demo = {k: v for k, v in world.docs.items() if k.startswith(("proposals/demo-", "jobs/demo-"))}
    expected = seed_demo.contribution(demo)
    for day, delta in expected.items():
        real = {} if day != YESTERDAY else {
            "proposalsIn": 11, "tokensIn": 150_000, "tokensOut": 30_000, "modelCalls": 20}
        row = stats[day]
        for key in ("proposalsIn", "tokensIn", "tokensOut", "modelCalls"):
            assert row.get(key, 0) == real.get(key, 0) + delta.get(key, 0), (day, key)
        for cat, n in delta.get("byCategory", {}).items():
            base = {"tidak_layak": 9, "risiko_tinggi": 2}.get(cat, 0) if day == YESTERDAY else 0
            assert row["byCategory"][cat] == base + n
    total_in = sum(v.get("proposalsIn", 0) for v in stats.values())
    assert total_in == 11 + seed_demo.GRADED + seed_demo.MANUAL
    assert sum(v.get("perluDicekManual", 0) for v in stats.values()) == seed_demo.MANUAL
    # Every token any demo job spent is in dailyStats, split by kind.
    jobs = [v for k, v in world.all("jobs").items() if k.startswith("demo-")]
    assert sum(v["tokensIn"] for v in stats.values()) == 150_000 + sum(j["tokensIn"] for j in jobs)
    for kind in ("penilaian", "ringkasan", "asisten"):
        assert sum(v.get("tokensByKind", {}).get(kind, {}).get("in", 0) for v in stats.values()) \
            == (150_000 if kind == "penilaian" else 0) + \
            sum(j["tokensIn"] for j in jobs if j["kind"] == kind)


def test_apply_again_changes_nothing(world):
    run(apply=True)
    after_first = copy.deepcopy(world.docs)
    report = run(apply=True)
    assert world.docs == after_first
    assert report["units"] == 0 and report["skipped"] > 0


def test_remove_restores_everything_else(world):
    before = copy.deepcopy(world.docs)
    run(apply=True)
    assert demo_paths(world)

    dry = copy.deepcopy(world.docs)
    seed_demo.remove(apply=False, out=lambda _: None)
    assert world.docs == dry

    seed_demo.remove(apply=True, out=lambda _: None)
    assert demo_paths(world) == []
    assert world.docs == before  # real docs and yesterday's dailyStats exactly as they were


def test_remove_after_a_partial_apply(world):
    """A unit is atomic: removing after only some units were written still restores the stats."""
    before = copy.deepcopy(world.docs)
    units, _ = seed_demo.build_plan(seed_demo.db.load_rules(), NOW)
    for unit in units[::3]:
        seed_demo._write_unit(unit)
    seed_demo.remove(apply=True, out=lambda _: None)
    assert world.docs == before
