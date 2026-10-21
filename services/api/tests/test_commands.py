import pytest

from aisa.commands import Confirm, Correct, Respond, RespondBulk, Resume, Stop, match_name, parse
from aisa.models import Category, ResponseKind as K


@pytest.mark.parametrize("text,expected", [
    ("STOP", Stop()), ("stop", Stop()), ("Lanjut", Resume()), ("YA", Confirm()), ("ya.", Confirm()),
    ("undang Tani Maju", Respond(K.undang, "Tani Maju")),
    ("Pantau  sawahku", Respond(K.pantau, "sawahku")),
    ("arsipkan Kopi Rakyat", Respond(K.arsipkan, "Kopi Rakyat")),
    ("arsipkan semua tidak cocok", RespondBulk(K.arsipkan, Category.tidak_cocok)),
    ("Undang semua Sangat Cocok", RespondBulk(K.undang, Category.sangat_cocok)),
    ("pantau semua cocok", RespondBulk(K.pantau, Category.cocok)),
    ("arsipkan semua kurang cocok", RespondBulk(K.arsipkan, Category.kurang_cocok)),
    ("pindahkan Kopi Rakyat ke cocok karena tim kuat", Correct("Kopi Rakyat", Category.cocok, "tim kuat")),
    ("Pindahkan Tani Maju ke sangat cocok karena traksi bagus sekali",
     Correct("Tani Maju", Category.sangat_cocok, "traksi bagus sekali")),
    ("pindahkan Tani Maju ke tidak cocok", Correct("Tani Maju", Category.tidak_cocok, None)),
    ("pindahkan Tani Maju ke kurang cocok karena", Correct("Tani Maju", Category.kurang_cocok, None)),
])
def test_parse_commands(text, expected):
    assert parse(text) == expected


@pytest.mark.parametrize("text", [
    "Fintech yang sangat cocok", "Kenapa skor Panen Kita segitu?", "Bandingkan Tani Maju dan SawahKu",
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
