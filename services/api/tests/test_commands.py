import pytest

from aisa.commands import Confirm, Correct, Respond, RespondBulk, Resume, Stop, match_name, parse
from aisa.models import Category, ResponseKind as K


@pytest.mark.parametrize("text,expected", [
    ("STOP", Stop()), ("stop", Stop()), ("Lanjut", Resume()), ("YA", Confirm()), ("ya.", Confirm()),
    ("undang Tani Maju", Respond(K.undang, "Tani Maju")),
    ("Pantau  sawahku", Respond(K.pantau, "sawahku")),
    ("arsipkan Kopi Rakyat", Respond(K.arsipkan, "Kopi Rakyat")),
    ("arsipkan semua tidak layak", RespondBulk(K.arsipkan, Category.tidak_layak)),
    ("Undang semua Sangat Layak", RespondBulk(K.undang, Category.sangat_layak)),
    ("pantau semua layak  bersyarat", RespondBulk(K.pantau, Category.layak_bersyarat)),
    ("arsipkan semua perlu penyesuaian", RespondBulk(K.arsipkan, Category.perlu_penyesuaian)),
    ("arsipkan semua RISIKO TINGGI", RespondBulk(K.arsipkan, Category.risiko_tinggi)),
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
    ("arsipkan semua layak", Respond(K.arsipkan, "semua layak")),
])
def test_parse_commands(text, expected):
    assert parse(text) == expected


@pytest.mark.parametrize("text", [
    "Fintech yang sangat layak", "pindahkan Tani Maju ke layak karena bagus", "Kenapa skor Panen Kita segitu?", "Bandingkan Tani Maju dan SawahKu",
    "stop dulu ya", "undang", "",
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
