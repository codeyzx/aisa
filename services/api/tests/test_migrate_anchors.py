"""`aisa migrate-anchors`: fills only a missing or blank level 2/4 from the defaults, keeps
every stored text, saves through update_rules (version, rulesVersions, history), is a no-op on
a complete doc, and the dry run writes nothing."""

from __future__ import annotations

import copy

import pytest
from conftest import T0

from aisa.migrate_anchors import REASON, migrate
from aisa.models import DEFAULT_ANCHORS, Criterion, Rules, default_rules, to_doc

CUSTOM = "Teks investor sendiri"


def old_doc() -> dict:
    """A doc saved before levels 2 and 4 existed, with the investor's own 1/3/5 texts."""
    d = to_doc(default_rules(T0))
    d.update(version=4, reason="lama")
    d["anchors"] = {c.value: {"1": f"{CUSTOM} 1", "3": f"{CUSTOM} 3", "5": f"{CUSTOM} 5"}
                    for c in Criterion}
    # One criterion already has its own "2"; another has a blank "4".
    d["anchors"]["manajemen"]["2"] = f"{CUSTOM} 2"
    d["anchors"]["kinerja"]["4"] = "  "
    return d


@pytest.fixture
def world(fs):
    fs.document("settings/rules").set(old_doc())
    return fs


def test_dry_run_writes_nothing(world):
    before = copy.deepcopy(world.docs)
    lines: list[str] = []
    report = migrate(apply=False, out=lines.append)
    assert world.docs == before
    assert report["diisi"]["manajemen"] == ["4"]
    assert report["diisi"]["kinerja"] == ["2", "4"]
    assert any("--apply" in line for line in lines)


def test_apply_fills_missing_and_keeps_custom_texts(world):
    report = migrate(apply=True, out=lambda _: None)
    assert report["versi"] == 5
    rules = world.get("settings/rules")
    assert rules["version"] == 5 and rules["reason"] == REASON
    assert world.get("rulesVersions/5") == rules
    for c in Criterion:
        a = rules["anchors"][c.value]
        assert (a["1"], a["3"], a["5"]) == (f"{CUSTOM} 1", f"{CUSTOM} 3", f"{CUSTOM} 5")
        assert a["4"] == DEFAULT_ANCHORS[c].four
        assert a["2"] == (f"{CUSTOM} 2" if c is Criterion.manajemen else DEFAULT_ANCHORS[c].two)
    # Everything else is carried over.
    old = old_doc()
    for k in ("weights", "fit", "thresholds", "models", "minCharsPerPage", "retentionDays"):
        assert rules[k] == old[k]
    Rules.model_validate(rules)
    hist = list(world.all("history").values())
    assert len(hist) == 1
    h = hist[0]
    assert (h["action"], h["via"], h["before"], h["after"], h["reason"]) == \
        ("aturan_diubah", "sistem", 4, 5, REASON)


def test_complete_doc_is_a_no_op(world):
    migrate(apply=True, out=lambda _: None)
    before = copy.deepcopy(world.docs)
    lines: list[str] = []
    report = migrate(apply=True, out=lines.append)
    assert world.docs == before
    assert report["diisi"] == {} and report["versi"] == 5
    assert any("sudah lengkap" in line for line in lines)


def test_missing_criterion_is_refused_without_writing(world):
    d = old_doc()
    del d["anchors"]["dampak"]
    world.document("settings/rules").set(d)
    before = copy.deepcopy(world.docs)
    report = migrate(apply=True, out=lambda _: None)
    assert world.docs == before
    assert report["lengkap"] is False
