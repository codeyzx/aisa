from datetime import datetime, timedelta, timezone

from aisa.digest import (
    DigestData, Item, focus_marks_ok, grade_headings_ok, has_advice, names_present, numbers_ok,
    sector_candidates, template, template_insight,
)
from aisa.gowa import signature_valid, split_message
from aisa.models import Category
from aisa.pdftext import too_little_text, with_markers

NOW = datetime(2026, 10, 21, 2, 0, tzinfo=timezone.utc)  # 09.00 WIB, a Wednesday


def data():
    g = {c: [] for c in Category}
    g[Category.sangat_layak] = [Item("a", "Tani Maju", 93, "agritech", 5_000_000_000, "Marketplace panen.")]
    g[Category.layak_bersyarat] = [Item("b", "SawahKu", 76.5)]
    g[Category.perlu_penyesuaian] = [Item("c", "Kopi Rakyat", 69, "f&b", out_of_focus=True)]
    return DigestData(slot="09.00", salutation="Ibu", window_start=NOW - timedelta(hours=16), groups=g,
                      manual=[Item("d", "Bengkel Online", 0)], baru_masuk=4,
                      insight="proposal agritech naik 50% dibanding minggu lalu (2 → 3).", at=NOW)


def test_template_contents_and_counts():
    d = data()
    t = template(d)
    assert t.startswith("Selamat pagi, Ibu. Sejak ringkasan Selasa pukul 17.00 masuk 4 proposal baru.")
    assert "Ada 4 proposal yang belum Ibu tanggapi." in t
    assert "1. Tani Maju (agritech, Rp5 M) · 93." in t
    assert "*Layak bersyarat (1)*: SawahKu (76,5)\n" in t
    assert "*Perlu penyesuaian (1)*: Kopi Rakyat (69) (di luar fokus)" in t
    assert "*Risiko tinggi (0)*" in t and "*Tidak layak (0)*" in t
    assert "1 di antaranya di luar fokus (sektor, tahap, atau dana): prioritas rendah." in t
    assert "*Perlu dicek manual (1)*: Bengkel Online" in t
    # grade headings in order, best first
    heads = ["*Sangat layak (", "*Layak bersyarat (", "*Perlu penyesuaian (", "*Risiko tinggi (",
             "*Tidak layak ("]
    assert [t.index(h) for h in heads] == sorted(t.index(h) for h in heads)
    c = d.counts()
    assert c.belumDitanggapi == 4 and c.luarFokus == 1
    assert (c.sangat_layak, c.layak_bersyarat, c.perlu_penyesuaian, c.risiko_tinggi, c.tidak_layak) == (1, 1, 1, 0, 0)


def test_out_of_focus_marks_every_named_grade_and_counts_unnamed_ones():
    d = data()
    d.groups[Category.sangat_layak][0].out_of_focus = True
    d.groups[Category.tidak_layak] = [Item("e", "Warung Kita", 20, out_of_focus=True)]
    t = template(d)
    assert "1. Tani Maju (agritech, Rp5 M) · 93 (di luar fokus). Marketplace panen." in t
    assert "Warung Kita" not in t  # the lowest grades are counted, not named
    assert "*Tidak layak (1)*" in t
    assert d.counts().luarFokus == 3
    assert "3 di antaranya di luar fokus" in t


def test_no_out_of_focus_line_when_none():
    d = data()
    d.groups[Category.perlu_penyesuaian][0].out_of_focus = False
    t = template(d)
    assert "di luar fokus" not in t and d.counts().luarFokus == 0


def test_number_check():
    d = data()
    t = template(d)
    assert numbers_ok(t, t)
    assert numbers_ok(t.replace("Tani Maju", "Tani Maju yang bagus"), t)
    assert not numbers_ok(t.replace("· 93.", "· 95."), t)
    assert not numbers_ok(t + "\nNaik 999%.", t)
    assert names_present(t, d)
    assert not names_present(t.replace("SawahKu", "Sawah"), d)
    assert not names_present(t.replace("Kopi Rakyat", "Kopi"), d)


def test_focus_marks_and_grade_headings_check():
    d = data()
    t = template(d)
    assert focus_marks_ok(t, d) and grade_headings_ok(t)
    assert not focus_marks_ok(t.replace(" (di luar fokus)", ""), d)
    assert not grade_headings_ok(t.replace("*Risiko tinggi (0)*\n", ""))


def test_advice_detection():
    assert has_advice("Sebaiknya Ibu undang Tani Maju.")
    assert not has_advice(template(data()))


def test_sector_candidates():
    rows = [(NOW - timedelta(days=1), "agritech")] * 6 + [(NOW - timedelta(days=9), "agritech")] * 4 \
        + [(NOW - timedelta(days=2), "fintech")] * 3 + [(NOW - timedelta(days=9), "fintech")] \
        + [(NOW - timedelta(days=2), "edtech"), (NOW - timedelta(days=20), "edtech"), (NOW, None)]
    c = sector_candidates(rows, NOW)
    agri = next(x for x in c if x["sektor"] == "Agritech")
    assert agri == {"sektor": "Agritech", "mingguIni": 6, "mingguLalu": 4, "perubahanPersen": 50}
    # last week too thin for a percentage; edtech too thin to mention at all
    assert next(x for x in c if x["sektor"] == "Fintech") == {"sektor": "Fintech", "mingguIni": 3, "mingguLalu": 1}
    assert all(x["sektor"] != "Edtech" for x in c)
    assert template_insight(c) == "proposal Agritech naik 50% dibanding minggu lalu (4 → 6)."


def test_thin_data_gives_no_insight():
    rows = [(NOW - timedelta(days=1), "f&b")]
    assert sector_candidates(rows, NOW) == []
    assert template_insight([]) is None


def test_count_insight_without_percentage():
    c = [{"sektor": "fintech", "mingguIni": 3, "mingguLalu": 0}]
    assert template_insight(c) == "minggu ini ada 3 proposal fintech, minggu lalu belum ada."


def test_opening_first_digest_and_since_last():
    first = data()
    first.window_start = None
    assert "Ini ringkasan pertama dari AISA" in template(first)
    assert "Sejak ringkasan" in template(data())


def test_split_message():
    text = "\n".join(f"baris {i} " + "x" * 90 for i in range(100))
    parts = split_message(text, 3500)
    assert len(parts) > 1 and all(len(p) <= 3500 for p in parts)
    assert "\n".join(parts) == text


def test_signature():
    import hashlib
    import hmac
    body = b'{"event":"message"}'
    sig = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert signature_valid(body, sig, "s3cret")
    assert not signature_valid(body + b" ", sig, "s3cret")
    assert not signature_valid(body, sig, "")
    assert not signature_valid(body, None, "s3cret")


def test_pdf_text_helpers():
    assert with_markers(["a", "b"]) == "[hal. 1]\na\n\n[hal. 2]\nb"
    assert too_little_text(["x" * 10] * 5, 200)
    assert not too_little_text(["x" * 300] * 5, 200)
    assert too_little_text([], 200)
