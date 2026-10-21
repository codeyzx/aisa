import pytest

from aisa.penilai import (
    PCitation,
    PCriterion,
    PenilaiInvalid,
    PenilaiOutput,
    PProfile,
    quote_found,
    validate,
)

PAGES = [
    "Sawah Pintar\nPitch Deck - Pendanaan Seed",
    "Traksi\n- 3.850 petani aktif bulanan (MAU) per September 2026,  naik dari 620",
    "Tim\nRina Kartikasari, CEO: 9 tahun di perusahaan benih nasional",
]
Q = {1: "Pendanaan Seed", 2: "3.850 petani aktif bulanan", 3: "9 tahun di perusahaan benih"}


def crit(v=3, nm=False, pages=(1,), quote=None):
    cites = [PCitation(page=p, quote=quote if quote is not None else Q[p]) for p in pages]
    return PCriterion(value=v, reason="r", notMentioned=nm, citations=cites)


def out(**over):
    base = dict(tim=crit(), pasar=crit(), produk=crit(), traksi=crit(), bisnis=crit(1, True, ()),
                profile=PProfile(startupName="X", sector=" Agritech ", stage="Seed", fundingAskIdr=0, oneLiner=None))
    base.update(over)
    return PenilaiOutput(**base)


def test_valid_output_normalises_profile():
    criteria, profile = validate(out(), PAGES)
    assert criteria["bisnis"].notMentioned and criteria["bisnis"].value == 1
    assert profile.sector == "agritech" and profile.stage == "seed" and profile.fundingAskIdr is None


@pytest.mark.parametrize("bad", [
    {"tim": crit(6)}, {"tim": crit(0)}, {"tim": crit(3, True, ())}, {"tim": crit(3, False, ())},
    {"tim": crit(3, False, (9,), quote="x")},
])
def test_invalid_outputs_rejected(bad):
    with pytest.raises(PenilaiInvalid):
        validate(out(**bad), PAGES)


def test_evidence_comes_before_value_in_schema():
    keys = list(PCriterion.model_fields)
    assert keys.index("citations") < keys.index("value") and keys.index("reason") < keys.index("value")


@pytest.mark.parametrize("quote,page", [
    ("3.850 petani aktif bulanan (MAU) per September 2026, naik dari 620", 2),  # double space on page
    ("TRAKSI - 3.850 PETANI", 2),  # case and line break
    ("“Pendanaan Seed”", 1),  # typographic quotes around it
    ("Rina Kartikasari, CEO … perusahaan benih nasional", 3),  # elided with an ellipsis
])
def test_quote_found_tolerates_whitespace_case_and_elision(quote, page):
    assert quote_found(quote, PAGES[page - 1])


@pytest.mark.parametrize("quote,page", [
    ("4.000 petani aktif bulanan", 2),  # invented number
    ("3.850 petani aktif bulanan", 1),  # right words, wrong page
    ("Tim", 3),  # too short to prove anything
    ("Rina Kartikasari ... 12 tahun", 3),  # one fragment missing
])
def test_quote_not_found(quote, page):
    assert not quote_found(quote, PAGES[page - 1])


def test_verified_citation_keeps_value():
    criteria, _ = validate(out(traksi=crit(5, pages=(2,))), PAGES)
    assert criteria["traksi"].value == 5 and criteria["traksi"].reason == "r"
    assert len(criteria["traksi"].citations) == 1


def test_no_quote_found_caps_value_at_two_and_records_it():
    criteria, _ = validate(out(traksi=crit(5, pages=(2,), quote="12.000 petani aktif")), PAGES)
    t = criteria["traksi"]
    assert t.value == 2 and t.citations == [] and not t.notMentioned
    assert "diturunkan dari 5 ke 2" in t.reason and "1 dari 1 kutipan" in t.reason


def test_some_quotes_missing_drops_them_and_downgrades_one_step():
    c = crit(5, pages=(2,))
    c.citations.append(PCitation(page=3, quote="pernah memimpin unicorn"))
    criteria, _ = validate(out(tim=c), PAGES)
    t = criteria["tim"]
    assert t.value == 4 and [x.page for x in t.citations] == [2]
    assert "diturunkan dari 5 ke 4" in t.reason and "1 dari 2 kutipan" in t.reason


def test_downgrade_never_goes_below_two_and_notes_dropped_quote():
    criteria, _ = validate(out(pasar=crit(2, pages=(1,), quote="tidak ada di deck")), PAGES)
    p = criteria["pasar"]
    assert p.value == 2 and p.citations == [] and "dibuang" in p.reason


def test_not_mentioned_and_contradiction_are_left_alone():
    contradiction = crit(1, pages=(2,), quote="angka ini tidak ada")
    criteria, _ = validate(out(produk=contradiction), PAGES)
    assert criteria["produk"].value == 1 and criteria["produk"].citations == []
    assert "dibuang" in criteria["produk"].reason
    assert criteria["bisnis"].value == 1 and criteria["bisnis"].reason == "r"
