import pytest

from aisa.commands import (
    Confirm,
    Correct,
    LegacyWord,
    Respond,
    RespondBulk,
    Resume,
    Stop,
    match_name,
    parse,
)
from aisa.models import Category, ResponseKind as K


@pytest.mark.parametrize("text,expected", [
    ("STOP", Stop()), ("stop", Stop()), ("Lanjut", Resume()), ("YA", Confirm()), ("ya.", Confirm()),
    ("setuju Tani Maju", Respond(K.setuju, "Tani Maju")),
    ("Setuju  sawahku", Respond(K.setuju, "sawahku")),
    ("tolak Kopi Rakyat", Respond(K.tolak, "Kopi Rakyat")),
    ("TOLAK Kopi Rakyat.", Respond(K.tolak, "Kopi Rakyat")),
    ("tolak semua tidak layak", RespondBulk(K.tolak, Category.tidak_layak)),
    ("Setuju semua Sangat Layak", RespondBulk(K.setuju, Category.sangat_layak)),
    ("setuju semua layak  bersyarat", RespondBulk(K.setuju, Category.layak_bersyarat)),
    ("tolak semua perlu penyesuaian", RespondBulk(K.tolak, Category.perlu_penyesuaian)),
    ("tolak semua RISIKO TINGGI", RespondBulk(K.tolak, Category.risiko_tinggi)),
    ("pindahkan Kopi Rakyat ke layak bersyarat karena tim kuat",
     Correct("Kopi Rakyat", Category.layak_bersyarat, "tim kuat")),
    ("Pindahkan Tani Maju ke sangat layak karena kinerja bagus sekali",
     Correct("Tani Maju", Category.sangat_layak, "kinerja bagus sekali")),
    ("pindahkan Tani Maju ke tidak layak", Correct("Tani Maju", Category.tidak_layak, None)),
    ("pindahkan Tani Maju ke risiko tinggi karena", Correct("Tani Maju", Category.risiko_tinggi, None)),
    # A name that ends in a grade word still splits at the last " ke <grade>".
    ("pindahkan Layak Jaya ke perlu penyesuaian karena dana belum jelas",
     Correct("Layak Jaya", Category.perlu_penyesuaian, "dana belum jelas")),
    # "layak" alone is not a grade word: this is a response to a proposal named "semua layak".
    ("tolak semua layak", Respond(K.tolak, "semua layak")),
    # The old decision words are recognised only to answer with the new commands.
    ("undang Tani Maju", LegacyWord("undang")),
    ("Pantau  sawahku", LegacyWord("pantau")),
    ("ARSIPKAN semua tidak layak", LegacyWord("arsipkan")),
    ("undang", LegacyWord("undang")),
])
def test_parse_commands(text, expected):
    assert parse(text) == expected


@pytest.mark.parametrize("text", [
    "Fintech yang sangat layak", "pindahkan Tani Maju ke layak karena bagus", "Kenapa skor Panen Kita segitu?", "Bandingkan Tani Maju dan SawahKu",
    "stop dulu ya", "setuju", "tolak", "", "undangan founder minggu ini?",
])
def test_non_commands_go_to_assistant(text):
    assert parse(text) is None


P = [("a", "Tani Maju"), ("b", "Tani Makmur"), ("c", "SawahKu"), ("d", "Kopi Rakyat")]


def test_match_exact_case_insensitive():
    assert match_name("tani maju", P).id == "a"


def test_match_unique_prefix():
    assert match_name("sawah", P).id == "c"


def test_match_ambiguous_prefix_returns_candidates():
    m = match_name("tani", P)
    assert m.id is None and {c[0] for c in m.candidates} == {"a", "b"}


def test_match_fuzzy_unique():
    assert match_name("kopi rakyatt", P).id == "d"


def test_match_none():
    m = match_name("zzz", P)
    assert m.id is None and m.candidates == []
