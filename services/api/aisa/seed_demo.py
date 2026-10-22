"""`aisa seed-demo`: a modest, fictional demo dataset so every dashboard chart has something
to draw, and `--remove` to take it out again.

Dry-run by default: it reads `settings/rules` and the docs it would create, prints the plan,
and writes nothing. `--apply` writes. Every doc it creates has an id starting with `demo-`
(`proposals`, `proposalTexts`, `jobs` with their `steps`, `history`, `digests`), so `--remove`
finds them by id alone and never touches another doc.

What it writes, over the 13 WIB days before today (today is left to real traffic):
- ~42 proposals from the `form` (no `driveFileId`, so the dashboard shows no deck button):
  40 assessed, 2 `perlu_dicek_manual`. Criterion values are picked per target grade and the
  score, grade and fit are computed by `scoring` with the live rules, so nothing contradicts
  the rules in force. Each gets its `proposalTexts` (holding every quoted citation), one
  `penilaian` job with the steps `run_intake` records, a `proposal_masuk` history row, and
  for about half of the older ones a `tanggapan` (setuju/tolak) a few hours to two days later;
- a few `asisten` jobs per day, a 09.00 daily digest per day and the 17.00 weekly summary on
  Fridays, each digest with its `ringkasan` job and `ringkasan_terkirim` row. Digest text and
  counts come from `digest.py`'s own template code over the demo proposals as they stood at
  send time. A slot that already has a real digest that day is skipped;
- `dailyStats`: each unit (a proposal with its job, or one job) adds exactly what intake and
  `JobLog.finish` would add, inside the same transaction that creates the unit's docs.

Idempotent: ids are fixed (a startup slug, or the day offset), the RNG seed is fixed, and a
unit whose primary doc exists is skipped whole, aggregates included. `--remove` deletes each
unit and subtracts its contribution in one transaction, computed from the stored docs; a map
key or a whole `dailyStats` doc that drops to zero is removed, so a day the demo created
disappears and a real day returns to its previous values."""

from __future__ import annotations

import json
import math
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from itertools import product
from typing import Any

from google.cloud import firestore

from . import db
from .config import settings
from .digest import (
    DAILY,
    WEEKLY,
    DigestData,
    Item,
    Row,
    Seen,
    WeeklyData,
    fmt_score,
    insight_candidates,
    rank_key,
    template,
    template_insight,
    week_start,
    weekly_candidates,
    weekly_counts,
    weekly_stats,
    weekly_template,
    weekly_template_insight,
)
from .models import (
    CATEGORY_LABEL,
    Assessment,
    Category,
    Citation,
    Criterion,
    CriterionResult,
    Digest,
    Founder,
    History,
    Job,
    JobKind,
    JobStatus,
    Profile,
    Proposal,
    ProposalStatus,
    ProposalText,
    Response,
    ResponseKind,
    Rules,
    Source,
    SourceKind,
    Step,
    StepActor,
    Tokens,
    Via,
    to_doc,
)
from .scoring import categorize, compute_score, fit_check, format_idr

PREFIX = "demo-"
RNG_SEED = 20261022
DAYS_BACK = 13  # day offsets 1..13 before today (WIB)
GRADED = 40
MANUAL = 2
# Grade mix of the 40 assessed proposals.
GRADE_QUOTA: dict[Category, int] = {
    Category.sangat_layak: 6,
    Category.layak_bersyarat: 10,
    Category.perlu_penyesuaian: 10,
    Category.risiko_tinggi: 8,
    Category.tidak_layak: 6,
}
# How loosely grades follow time: lower makes the upward drift of the mean score steeper.
NOISE = 4.8
RESPOND_MIN_AGE_DAYS = 3  # only proposals at least this old may carry a decision

COLLECTIONS = ("proposals", "proposalTexts", "jobs", "history", "digests")


# ---------- the fictional catalogue ----------

@dataclass(frozen=True)
class Vocab:
    unit: str  # who the startup serves, plural-neutral
    word: str  # the industry, as a deck would say it
    partners: tuple[str, ...]
    prev_role: str
    risk: str
    mitigation: str
    license: str
    impact_verb: str
    impact_result: str


VOCAB: dict[str, Vocab] = {
    "agritech": Vocab("petani", "pertanian", ("Koperasi Tani Sumber Makmur", "Gapoktan Sido Rukun",
                                              "KUD Mekar Sari"),
                      "manajer rantai pasok di perusahaan agribisnis", "gagal panen akibat cuaca",
                      "bekerja sama dengan asuransi pertanian dan menyebar lokasi tanam",
                      "izin usaha dari Dinas Pertanian",
                      "menjual hasil panen dengan harga yang lebih adil",
                      "mencatat kenaikan pendapatan rata-rata 18%"),
    "fintech": Vocab("UMKM", "pembiayaan UMKM", ("BPR Arta Sejahtera", "KSP Mitra Usaha Mandiri",
                                                 "Koperasi Pasar Sentosa"),
                     "manajer kredit mikro di bank swasta nasional", "kredit macet",
                     "menilai kelayakan dari data transaksi harian dan membatasi plafon awal",
                     "izin penyelenggara dari OJK", "mendapat akses modal kerja pertama",
                     "mendapat pinjaman modal kerja pertama"),
    "edtech": Vocab("siswa", "pendidikan vokasi", ("SMK Bina Karya Mandiri",
                                                   "Yayasan Pendidikan Cahaya Ilmu",
                                                   "SMA Tunas Harapan"),
                    "kepala program di lembaga kursus", "retensi pengguna yang turun setelah bulan pertama",
                    "menggabungkan kelas daring dengan mentor di sekolah",
                    "perjanjian kerja sama dengan Dinas Pendidikan",
                    "belajar keterampilan yang dicari industri", "lulus uji sertifikasi kompetensi"),
    "healthtech": Vocab("pasien", "layanan kesehatan", ("Klinik Pratama Sehat Bersama",
                                                        "Klinik Utama Medika Sejahtera",
                                                        "Puskesmas mitra di tiga kecamatan"),
                        "dokter dan manajer layanan di jaringan klinik", "kebocoran data pasien",
                        "mengenkripsi rekam medis dan mengaudit akses setiap bulan",
                        "izin penyelenggara sistem elektronik",
                        "mendapat layanan kesehatan lebih cepat",
                        "terlayani tanpa harus ke kota kabupaten"),
    "climate": Vocab("rumah tangga", "pengelolaan sampah dan energi bersih",
                     ("Bank Sampah Berseri", "Koperasi Energi Desa Terang",
                      "Komunitas Pesisir Lestari"),
                     "insinyur lingkungan di perusahaan energi",
                     "harga jual material daur ulang yang naik-turun",
                     "mengikat kontrak pembelian tahunan dengan pabrik daur ulang",
                     "izin pengelolaan limbah", "mengurangi sampah yang dibuang ke TPA",
                     "memilah sampah dari rumah secara rutin"),
    "logistik": Vocab("UMKM pengirim", "logistik", ("Koperasi Angkutan Nusantara Jaya",
                                                    "Asosiasi Pedagang Grosir Kota"),
                      "manajer operasional di perusahaan ekspedisi", "biaya bahan bakar yang naik",
                      "mengonsolidasikan muatan dan merencanakan rute harian",
                      "izin usaha jasa pengiriman", "mengirim barang dengan ongkos lebih murah",
                      "menghemat ongkos kirim rata-rata 22%"),
    "f&b": Vocab("outlet", "makanan dan minuman", ("Koperasi Pedagang Pasar Baru",
                                                    "Paguyuban Kuliner Kota Lama"),
                 "chef dan manajer restoran", "kenaikan harga bahan baku",
                 "membeli bahan baku langsung dari petani dengan kontrak harga",
                 "sertifikat laik higiene", "mendapat pasokan bahan baku yang stabil",
                 "menurunkan sisa bahan baku terbuang"),
    "pariwisata": Vocab("pemilik homestay", "pariwisata desa", ("Pokdarwis Danau Biru",
                                                                "Desa Wisata Lereng Hijau"),
                        "manajer pemasaran di jaringan hotel", "kunjungan wisatawan yang musiman",
                        "menjual paket wisata edukasi untuk sekolah di luar musim liburan",
                        "tanda daftar usaha pariwisata", "mendapat tamu sepanjang tahun",
                        "menaikkan tingkat hunian menjadi 61%"),
}


@dataclass(frozen=True)
class Startup:
    slug: str
    name: str
    sector: str
    one_liner: str


CATALOG: tuple[Startup, ...] = (
    Startup("sawah-cerdas", "Sawah Cerdas", "agritech",
            "Sensor kelembapan dan jadwal irigasi lewat SMS untuk petani padi."),
    Startup("irigasi-kita", "Irigasi Kita", "agritech",
            "Pompa air tenaga surya yang disewakan per musim tanam."),
    Startup("kebun-mandiri", "Kebun Mandiri", "agritech",
            "Pasar daring sayur dari kelompok tani ke dapur katering."),
    Startup("panenraya-data", "PanenRaya Data", "agritech",
            "Prediksi hasil panen dari citra satelit untuk koperasi."),
    Startup("benih-unggul-desa", "Benih Unggul Desa", "agritech",
            "Distribusi benih bersertifikat dengan pembayaran setelah panen."),
    Startup("ternak-sehat", "TernakSehat", "agritech",
            "Catatan kesehatan dan pakan sapi perah di peternakan rakyat."),
    Startup("ikan-segar-pesisir", "Ikan Segar Pesisir", "agritech",
            "Rantai dingin hasil tangkapan nelayan kecil ke restoran."),
    Startup("kopi-hulu", "Kopi Hulu", "agritech",
            "Pembelian kopi gelondong langsung dari petani dengan harga transparan."),
    Startup("pupuk-tepat", "Pupuk Tepat", "agritech",
            "Rekomendasi dosis pupuk dari uji tanah murah di lahan."),
    Startup("dompet-warung", "Dompet Warung", "fintech",
            "Pencatatan kas dan pinjaman modal untuk warung kelontong."),
    Startup("kasir-koperasi", "Kasir Koperasi", "fintech",
            "Sistem simpan pinjam digital untuk koperasi desa."),
    Startup("modal-tumbuh", "Modal Tumbuh", "fintech",
            "Pembiayaan invoice untuk pemasok UMKM ke ritel modern."),
    Startup("cicil-pupuk", "Cicil Pupuk", "fintech",
            "Cicilan sarana produksi pertanian yang dibayar saat panen."),
    Startup("arisan-aman", "Arisan Aman", "fintech",
            "Arisan digital dengan dana yang dititipkan di rekening bersama."),
    Startup("lapak-kredit", "Lapak Kredit", "fintech",
            "Skor kredit pedagang pasar dari riwayat transaksi QR."),
    Startup("tabung-desa", "Tabung Desa", "fintech",
            "Tabungan emas mikro lewat agen di desa."),
    Startup("invoice-lancar", "Invoice Lancar", "fintech",
            "Penagihan otomatis dan pengingat bayar untuk UMKM jasa."),
    Startup("kelas-vokasi", "Kelas Vokasi", "edtech",
            "Kursus keterampilan teknik bersertifikat untuk lulusan SMK."),
    Startup("guru-pintar-desa", "Guru Pintar Desa", "edtech",
            "Pelatihan guru SD di daerah lewat modul video luring."),
    Startup("laboratorium-maya", "Laboratorium Maya", "edtech",
            "Simulasi praktikum IPA untuk sekolah tanpa laboratorium."),
    Startup("kodekita-sekolah", "Kodekita Sekolah", "edtech",
            "Kurikulum pemrograman dasar untuk SMP dengan mentor daring."),
    Startup("mentor-kampus", "Mentor Kampus", "edtech",
            "Pendampingan magang dan karier untuk mahasiswa tingkat akhir."),
    Startup("baca-ceria", "Baca Ceria", "edtech",
            "Aplikasi literasi anak berbahasa daerah yang bisa dipakai luring."),
    Startup("bahasa-kerja", "Bahasa Kerja", "edtech",
            "Kelas bahasa Jepang dan Korea untuk calon pekerja migran."),
    Startup("klinik-rujuk", "Klinik Rujuk", "healthtech",
            "Sistem rujukan pasien dari puskesmas ke rumah sakit daerah."),
    Startup("bidan-siaga", "Bidan Siaga", "healthtech",
            "Pemantauan kehamilan oleh bidan desa lewat aplikasi ringan."),
    Startup("apotek-antar-desa", "Apotek Antar Desa", "healthtech",
            "Pengantaran obat resep dari apotek kecamatan ke desa."),
    Startup("gizi-anak", "GiziAnak", "healthtech",
            "Pemantauan tumbuh kembang balita untuk kader posyandu."),
    Startup("cek-tensi-rumah", "Cek Tensi Rumah", "healthtech",
            "Pemantauan hipertensi di rumah dengan tensimeter terhubung."),
    Startup("teleterapi-nusa", "TeleTerapi Nusa", "healthtech",
            "Fisioterapi jarak jauh untuk pasien pasca-stroke."),
    Startup("antre-sehat", "Antre Sehat", "healthtech",
            "Antrean daring dan pengingat kontrol untuk klinik pratama."),
    Startup("bank-sampah-pintar", "Bank Sampah Pintar", "climate",
            "Pencatatan setoran dan penjualan untuk bank sampah warga."),
    Startup("surya-atap-desa", "Surya Atap Desa", "climate",
            "Panel surya atap dengan skema sewa untuk rumah di desa."),
    Startup("daur-plastik-pesisir", "Daur Plastik Pesisir", "climate",
            "Pengolahan sampah plastik pesisir menjadi bahan bangunan."),
    Startup("kompos-kota", "Kompos Kota", "climate",
            "Penjemputan sampah organik rumah tangga untuk dijadikan kompos."),
    Startup("mangrove-karbon", "Mangrove Karbon", "climate",
            "Penanaman mangrove bersama nelayan dengan pendanaan kredit karbon."),
    Startup("gudang-bersama", "Gudang Bersama", "logistik",
            "Gudang berbagi pakai untuk penjual daring di kota lapis dua."),
    Startup("kirim-antar-pulau", "Kirim Antar Pulau", "logistik",
            "Konsolidasi kiriman kecil antarpulau lewat kapal perintis."),
    Startup("dapur-awan-rasa", "Dapur Awan Rasa", "f&b",
            "Dapur bersama untuk merek makanan rumahan yang dijual daring."),
    Startup("kopi-keliling-kota", "Kopi Keliling Kota", "f&b",
            "Gerobak kopi dengan sistem waralaba mikro."),
    Startup("homestay-danau", "Homestay Danau", "pariwisata",
            "Pemesanan homestay dan paket wisata desa di sekitar danau."),
    Startup("rute-desa-wisata", "Rute Desa Wisata", "pariwisata",
            "Paket perjalanan edukasi ke desa wisata untuk rombongan sekolah."),
)

FIRST = ("Ayu", "Bagas", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hendra", "Intan", "Joko",
         "Kartika", "Lukman", "Maya", "Nanda", "Oki", "Putri", "Raka", "Sari", "Taufik", "Utami",
         "Vino", "Wulan", "Yusuf", "Zahra", "Arif", "Bunga", "Candra", "Dian", "Elsa", "Farhan",
         "Galih", "Hana", "Ilham", "Jihan", "Krisna", "Laras", "Mira", "Niko", "Rani", "Satria",
         "Tiara", "Wisnu")
LAST = ("Saputra", "Wibowo", "Lestiani", "Nugroho", "Rahmawati", "Siregar", "Hutapea",
        "Pangestu", "Kusuma", "Maharani", "Setiadi", "Purnomo", "Halim", "Situmorang",
        "Wardhani", "Hidayat", "Prasetyo", "Anggraini", "Simanjuntak", "Firmansyah")
CITIES = ("Bandung", "Yogyakarta", "Semarang", "Malang", "Makassar", "Medan", "Denpasar",
          "Palembang", "Pontianak", "Kupang", "Jember", "Banyuwangi", "Surakarta", "Mataram")

SETUJU_NOTES = ("Jadwalkan pitching minggu depan", "Minta laporan keuangan 12 bulan terakhir",
                None, None, None)
TOLAK_NOTES = ("Di luar tesis investasi kami", "Traksi belum cukup untuk tahap ini", None, None)

ASK_TOOLS: tuple[tuple[str, dict[str, Any]], ...] = (
    ("get_overview", {}),
    ("search_proposals", {"category": "sangat_layak", "responded": False}),
    ("search_proposals", {"sector": "agritech", "limit": 5}),
    ("count_proposals", {"group_by": "sector"}),
    ("get_trends", {"days": 7}),
    ("search_proposals", {"outside_focus": True}),
    ("count_proposals", {"group_by": "category", "responded": False}),
)


# ---------- evidence text: quote on the page, reason in the Penilai's style ----------

@dataclass(frozen=True)
class Facts:
    """Numbers and names one fictional deck states, drawn once per startup."""
    city: str
    city2: str
    partner: str
    founder: str
    years: int
    users: int
    revenue: int  # Rp juta per bulan
    revenue0: int
    growth: int
    impact_n: int
    survey_n: int
    target_m: int
    cac: int
    ltv: int
    prior_raise_m: int


def _n(x: int) -> str:
    """Indonesian thousands separator: 1250 → 1.250."""
    return f"{x:,}".replace(",", ".")


def _evidence(c: Criterion, v: int, s: Startup, f: Facts, ask: str, page: int
              ) -> tuple[str, str]:
    """(quote as it appears on the page, reason). Value 1 is never quoted."""
    w = VOCAB[s.sector]
    hal = f"(hal. {page})"
    if c is Criterion.manajemen:
        q, ev, gap = {
            2: (f"Tim kami solid dan berpengalaman, siap membawa {s.name} tumbuh lebih cepat.",
                "tim hanya digambarkan sebagai 'solid dan berpengalaman'",
                "peran dan latar belakang tiap anggota belum disebut"),
            3: ((f"{f.founder} (CEO) mengurus produk dan kemitraan, dibantu CTO dan kepala "
                f"operasional yang berpengalaman di bidang {w.word}."),
                "tim disebut dengan peran CEO, CTO, dan kepala operasional",
                "belum ada rekam jejak yang bisa dicek"),
            4: ((f"{f.founder} (CEO) sebelumnya {w.prev_role} selama {f.years} tahun; CTO pernah "
                "memimpin tim engineering di perusahaan teknologi nasional."),
                "rekam jejak CEO dan CTO disebut beserta tempat kerja sebelumnya",
                "belum ada capaian berangka dan posisi kepala penjualan masih kosong"),
            5: ((f"{f.founder} (CEO) {f.years} tahun sebagai {w.prev_role} dan pernah membawa "
                f"startup sebelumnya meraih pendanaan Rp{f.prior_raise_m} M; tim inti enam orang "
                "lengkap dari produk hingga keuangan."),
                "rekam jejak berangka para pendiri dan peran kunci yang lengkap", ""),
        }[v]
    elif c is Criterion.kinerja:
        q, ev, gap = {
            2: (f"Antusiasme {w.unit} sangat tinggi dan pengguna kami tumbuh pesat setiap bulan.",
                "traksi hanya diklaim 'tumbuh pesat'", "belum ada angka pengguna atau pendapatan"),
            3: (f"Saat ini {s.name} sudah dipakai oleh sekitar {_n(f.users)} {w.unit} di {f.city}.",
                f"ada sekitar {_n(f.users)} {w.unit} pengguna",
                "angkanya tanpa periode dan tanpa nama pelanggan"),
            4: ((f"Per Agustus 2026: {_n(f.users)} {w.unit} aktif dan pendapatan Rp{f.revenue} juta "
                f"per bulan, bermitra dengan {f.partner}."),
                "pengguna dan pendapatan berperiode serta mitra yang disebut namanya",
                "pertumbuhan dari bulan ke bulan belum ditunjukkan"),
            5: ((f"Pendapatan naik dari Rp{f.revenue0} juta (Januari 2026) ke Rp{f.revenue} juta "
                f"(Agustus 2026); {_n(f.users)} {w.unit} aktif, pelanggan utama {f.partner}."),
                ("pendapatan, pengguna, dan pertumbuhan berperiode dengan pelanggan yang disebut "
                "namanya"), ""),
        }[v]
    elif c is Criterion.risiko:
        q, ev, gap = {
            2: ("Persaingan di pasar ini memang ketat, tetapi pasarnya sangat besar.",
                "risiko hanya disinggung sebagai 'persaingan ketat'",
                "belum ada mitigasi atau data pasar"),
            3: ((f"Risiko utama kami adalah {w.risk}; kami akan mengatasinya dengan memperkuat "
                "kemitraan."),
                f"risiko utama ({w.risk}) disebut",
                "mitigasinya masih umum dan tren pasar tidak didukung data"),
            4: ((f"Untuk mengurangi {w.risk}, kami {w.mitigation}; pasar {w.word} tumbuh "
                f"{f.growth}% per tahun."),
                f"risiko {w.risk} disebut dengan mitigasi konkret dan tren pasar berangka",
                "angka pasarnya tanpa sumber dan risiko regulasi belum dibahas"),
            5: ((f"Risiko {w.risk} kami tekan dengan {w.mitigation}; {w.license} sudah terbit dan "
                f"pasar {w.word} tumbuh {f.growth}% per tahun (laporan asosiasi industri, 2025)."),
                "risiko utama, mitigasi, regulasi, dan tren pasar bersumber dibahas", ""),
        }[v]
    elif c is Criterion.rencana:
        q, ev, gap = {
            2: ("Dana yang terkumpul akan dipakai untuk ekspansi dan pengembangan bisnis.",
                "penggunaan dana hanya disebut 'untuk ekspansi'", "rincian dan angka belum ada"),
            3: (f"Kami menargetkan pendapatan Rp{f.target_m} M pada 2028 dengan pendanaan {ask}.",
                "ada target pendapatan dan besar dana yang diminta",
                "proyeksinya belum berpijak pada data aktual atau unit ekonomi"),
            4: ((f"Penggunaan dana: 40% teknologi, 35% ekspansi ke {f.city2}, 25% modal kerja; "
                "proyeksi kami dasarkan pada pertumbuhan delapan bulan terakhir."),
                "penggunaan dana dirinci dan proyeksi berbasis data aktual",
                "unit ekonomi dan imbal hasil bagi investor belum dijelaskan"),
            5: ((f"Biaya akuisisi Rp{f.cac} ribu dan nilai seumur pelanggan Rp{f.ltv} ribu; dengan "
                f"dana {ask} kami menargetkan titik impas pada bulan ke-18."),
                "unit ekonomi, rincian dana, dan proyeksi titik impas dijelaskan", ""),
        }[v]
    else:
        q, ev, gap = {
            2: (f"{s.name} hadir untuk memberi dampak sosial yang luas bagi masyarakat.",
                "dampak hanya diklaim sebagai 'dampak sosial yang luas'",
                "belum disebut siapa yang terdampak"),
            3: (f"Kami membantu {w.unit} di {f.city} {w.impact_verb}.",
                f"dampak bagi {w.unit} disebut", "belum ada angka dampak"),
            4: (f"Sejauh ini {_n(f.impact_n)} {w.unit} {w.impact_result}.",
                f"ada angka dampak aktual ({_n(f.impact_n)} {w.unit})",
                "cara mengukurnya belum dijelaskan"),
            5: ((f"Sebanyak {_n(f.impact_n)} {w.unit} {w.impact_result}, diukur lewat survei "
                f"triwulanan terhadap {f.survey_n} responden."),
                "dampak terukur dengan angka dan cara mengukurnya", ""),
        }[v]
    if v == 5:
        reason = f"Nilai 5: {ev} {hal}, menutup patokan 5."
    else:
        reason = f"Nilai {v}: {ev} {hal}, tetapi {gap} untuk naik ke {v + 1}."
    return q, reason


# Which deck page each criterion's evidence sits on (before the deck's own length is applied).
EVIDENCE_PAGE = {Criterion.manajemen: 3, Criterion.kinerja: 5, Criterion.risiko: 7,
                 Criterion.rencana: 9, Criterion.dampak: 10}
FILLER = {
    1: "Pitch deck ini disusun untuk calon investor dan memuat ringkasan usaha, tim, traksi, "
       "risiko, rencana penggunaan dana, serta dampak yang ingin kami capai.",
    2: "Masalah yang kami selesaikan: akses yang terbatas, biaya yang tinggi, dan informasi "
       "yang tidak merata. Kami melihat langsung masalah ini selama bertahun-tahun di lapangan.",
    4: "Produk kami sederhana dipakai, bisa berjalan di ponsel murah dan tetap berfungsi saat "
       "sinyal lemah. Pengguna mendapatkan pelatihan singkat saat pendaftaran.",
    6: "Model bisnis: biaya langganan bulanan dan komisi per transaksi. Kami memulai dari satu "
       "kota lalu memperluas ke kota sekitarnya lewat mitra lokal.",
    8: "Pesaing kami kebanyakan pemain lokal kecil dan cara manual. Keunggulan kami ada pada "
       "jaringan mitra di lapangan dan data yang terkumpul setiap hari.",
}


# ---------- the plan ----------

@dataclass
class Unit:
    """Docs written together with one aggregate contribution. `primary` is the doc whose
    existence means the unit was already written."""
    label: str
    primary: str
    docs: list[tuple[str, dict]] = field(default_factory=list)


@dataclass
class Planned:
    pid: str
    startup: Startup
    created: datetime
    assessed: datetime
    doc: Proposal
    manual: bool


def _wib(day: date, hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=db.WIB)


def _vectors(rules: Rules) -> list[tuple[dict[Criterion, int], float, Category]]:
    out = []
    for combo in product(range(1, 6), repeat=5):
        values = dict(zip(Criterion, combo, strict=True))
        score = compute_score(rules.weights, values)
        out.append((values, score, categorize(score, rules.thresholds)))
    return out


def _band(rules: Rules, cat: Category) -> tuple[float, float]:
    t = rules.thresholds
    return {
        Category.sangat_layak: (t.sangatLayak, min(100.0, t.sangatLayak + 10)),
        Category.layak_bersyarat: (t.layakBersyarat, t.sangatLayak),
        Category.perlu_penyesuaian: (t.perluPenyesuaian, t.layakBersyarat),
        Category.risiko_tinggi: (t.risikoTinggi, t.perluPenyesuaian),
        Category.tidak_layak: (max(15.0, t.risikoTinggi - 25), t.risikoTinggi),
    }[cat]


def _pick_values(rng: random.Random, vectors, rules: Rules, cat: Category) -> dict[Criterion, int]:
    """A believable value set in grade `cat`: values close together (a deck is rarely
    excellent on one criterion and absent on the next), scored near a random point of the band."""
    spread = 2 if cat in (Category.sangat_layak, Category.layak_bersyarat) else 3
    pool = [(v, s) for v, s, c in vectors
            if c == cat and max(v.values()) - min(v.values()) <= spread]
    if not pool:
        pool = [(v, s) for v, s, c in vectors if c == cat]
    if not pool:
        raise ValueError(f"aturan aktif tidak bisa menghasilkan grade {cat.value}")
    lo, hi = _band(rules, cat)
    target = rng.uniform(lo, hi)
    weights = [math.exp(-abs(s - target) / 2.5) for _, s in pool]
    return dict(rng.choices(pool, weights=weights, k=1)[0][0])


def _funding(rng: random.Random, stage: str) -> int:
    lo, hi, step = {"pre-seed": (800, 2_000, 100), "seed": (1_500, 8_000, 500),
                    "seri-a": (10_000, 22_000, 1_000)}[stage]
    return rng.randrange(lo, hi + 1, step) * 1_000_000


def _day_counts(rng: random.Random, days: list[date]) -> list[int]:
    """Proposals per day: fewer on weekends, and at most two yesterday, where the real
    traffic of the last day is most likely to sit."""
    counts = [rng.choice((1, 1, 2)) if d.weekday() >= 5 else rng.choice((2, 3, 3, 4, 4, 5))
              for d in days]
    counts[-1] = min(counts[-1], 2)
    weekdays = [i for i, d in enumerate(days[:-1]) if d.weekday() < 5]
    total = GRADED + MANUAL
    while sum(counts) > total:
        i = rng.choice([i for i in weekdays if counts[i] > 2] or weekdays)
        counts[i] -= 1
    while sum(counts) < total:
        i = rng.choice([i for i in weekdays if counts[i] < 5] or weekdays)
        counts[i] += 1
    return counts


def _penilaian_job(rng: random.Random, pid: str, name: str, created: datetime, rules: Rules,
                   steps_spec: list[tuple[str, str, StepActor, dict]]) -> tuple[Job, list[Step]]:
    """The job `run_intake` records: the given steps back to back from just after arrival."""
    t = created + timedelta(seconds=rng.randint(2, 6))
    started = t
    steps: list[Step] = []
    tin = tout = 0
    for seq, (action, tool, actor, kw) in enumerate(steps_spec, 1):
        dur = kw.pop("durationMs")
        t = t + timedelta(milliseconds=dur)
        steps.append(Step(seq=seq, at=t, action=action, tool=tool, actor=actor, durationMs=dur,
                          **kw))
        tin += kw.get("tokensIn", 0)
        tout += kw.get("tokensOut", 0)
    end = t + timedelta(milliseconds=rng.randint(40, 200))
    used_model = any(s.actor == StepActor.model for s in steps)
    job = Job(kind=JobKind.penilaian, agent="Penilai", title=f"Menilai proposal {name}",
              model=rules.models.penilai if used_model else None, proposalId=pid,
              status=JobStatus.selesai, startedAt=started, endedAt=end,
              durationMs=int((end - started).total_seconds() * 1000), stepCount=len(steps),
              tokensIn=tin, tokensOut=tout)
    return job, steps


def _job_docs(jid: str, job: Job, steps: list[Step]) -> list[tuple[str, dict]]:
    return [(f"jobs/{jid}", to_doc(job))] + [(f"jobs/{jid}/steps/{s.seq:03d}", to_doc(s))
                                             for s in steps]


def _proposal_unit(rng: random.Random, vectors, rules: Rules, s: Startup, idx: int,
                   created: datetime, grade: Category | None, now: datetime,
                   respond: bool, manual_variant: int = 0) -> tuple[Unit, Planned]:
    pid = f"{PREFIX}{s.slug}"
    jid = f"{PREFIX}penilaian-{s.slug}"
    first, last = FIRST[idx % len(FIRST)], LAST[(idx * 7) % len(LAST)]
    founder = f"{first} {last}"
    city = CITIES[rng.randrange(len(CITIES))]
    facts = Facts(
        city=city, city2=rng.choice([c for c in CITIES if c != city]),
        partner=rng.choice(VOCAB[s.sector].partners), founder=founder,
        years=rng.randint(4, 12), users=rng.choice((120, 340, 860, 1_250, 2_400, 3_900)),
        revenue=rng.randint(45, 900), revenue0=0, growth=rng.randint(9, 24),
        impact_n=rng.choice((150, 420, 780, 1_300, 2_600)), survey_n=rng.choice((120, 200, 350)),
        target_m=rng.randint(8, 60), cac=rng.randint(25, 120), ltv=rng.randint(300, 1_400),
        prior_raise_m=rng.randint(3, 15))
    facts = Facts(**{**facts.__dict__, "revenue0": max(10, facts.revenue * rng.randint(35, 60) // 100)})
    stage = rng.choice(("pre-seed", "seed", "seed", "seri-a"))
    ask = _funding(rng, stage)
    page_count = rng.randint(12, 18)
    file_name = f"{s.name.replace(' ', '_')}_pitch_deck.pdf"
    source = Source(kind=SourceKind.form, fileName=file_name)
    founder_doc = Founder(name=founder, email=f"{first.lower()}.{last.lower()}@example.id")
    manual = grade is None
    steps_spec: list[tuple[str, str, StepActor, dict]] = [
        ("Ambil pitch deck", "storage", StepActor.kode, {"durationMs": rng.randint(600, 1_600)}),
        ("Ekstrak teks per halaman", "pypdf", StepActor.kode,
         {"durationMs": rng.randint(700, 2_400), "read": "pitch deck",
          "wrote": f"proposalTexts/{pid}"}),
        ("Cek jumlah teks", "kode", StepActor.kode,
         {"durationMs": rng.randint(2, 9), "read": f"proposalTexts/{pid}"}),
    ]
    rv = f"settings/rules v{rules.version}"
    docs: list[tuple[str, dict]] = []

    if manual:
        if manual_variant % 2 == 0:
            chars = rng.randint(300, 900)
            reason = (f"teks terlalu sedikit, juga setelah dibaca sebagai gambar "
                      f"({chars} karakter di {page_count} halaman)")
            steps_spec.append(("Baca teks dari gambar", "gemini.generate_content", StepActor.model,
                               {"durationMs": rng.randint(15_000, 40_000), "model": rules.models.penilai,
                                "read": "pitch deck", "wrote": f"proposalTexts/{pid}",
                                "tokensIn": rng.randint(9_000, 16_000),
                                "tokensOut": rng.randint(400, 1_100)}))
            pages = [f"{s.name}" if i == 0 else "" for i in range(page_count)]
            pages[1] = "Tim | Produk | Traksi"
        else:
            reason = "penilaian gagal validasi: nilai kriteria hilang: ['dampak']"
            for a in ("Menilai 5 kriteria", "Menilai 5 kriteria (ulang)"):
                steps_spec.append((a, "gemini.generate_content", StepActor.model,
                                   {"durationMs": rng.randint(18_000, 45_000),
                                    "model": rules.models.penilai, "read": f"proposalTexts/{pid}",
                                    "tokensIn": rng.randint(8_000, 14_000),
                                    "tokensOut": rng.randint(1_200, 2_500), "status": "gagal",
                                    "error": "nilai kriteria hilang: ['dampak']"}))
            pages = [FILLER.get(i + 1, f"{s.name} — halaman {i + 1}.") for i in range(page_count)]
        job, steps = _penilaian_job(rng, pid, s.name, created, rules, steps_spec)
        proposal = Proposal(
            name=s.name, nameLower=s.name.lower(), source=source, founder=founder_doc,
            consent=True, status=ProposalStatus.perlu_dicek_manual, statusReason=reason,
            pageCount=page_count, tokens=Tokens(**{"in": job.tokensIn, "out": job.tokensOut}),
            jobId=jid, createdAt=created, updatedAt=job.endedAt)
        history = History(at=job.endedAt, via=Via.sistem, action="proposal_masuk", proposalId=pid,
                          proposalName=s.name, after="perlu_dicek_manual",
                          detail=f"Proposal {s.name} masuk: perlu dicek manual ({reason})")
        docs += [(f"proposals/{pid}", to_doc(proposal)),
                 (f"proposalTexts/{pid}", to_doc(ProposalText(pages=pages,
                                                              charCount=sum(map(len, pages))))),
                 *_job_docs(jid, job, steps),
                 (f"history/{PREFIX}masuk-{s.slug}", to_doc(history))]
        planned = Planned(pid, s, created, job.endedAt, proposal, True)
        return Unit(f"proposal {s.name} (perlu dicek manual)", f"proposals/{pid}", docs), planned

    values = _pick_values(rng, vectors, rules, grade)
    shift = page_count - 12  # longer decks push the later sections back
    criteria: dict[Criterion, CriterionResult] = {}
    pages = [FILLER.get(i + 1, "") for i in range(page_count)]
    pages[0] = f"{s.name}\n{s.one_liner}\n{FILLER[1]}"
    ask_txt = format_idr(ask)
    for c in Criterion:
        v = values[c]
        page = EVIDENCE_PAGE[c] + (shift // 2 if c in (Criterion.rencana, Criterion.dampak) else 0)
        if v == 1:
            criteria[c] = CriterionResult(value=1, reason="tidak disebut", notMentioned=True)
            continue
        quote, reason = _evidence(c, v, s, facts, ask_txt, page)
        pages[page - 1] = f"{pages[page - 1]}\n{quote}".strip()
        criteria[c] = CriterionResult(value=v, reason=reason, notMentioned=False,
                                      citations=[Citation(page=page, quote=quote)])
    for i, text in enumerate(pages):
        if len(text) < rules.minCharsPerPage:
            pages[i] = f"{text}\n{FILLER[2]} {FILLER[6]}".strip()

    profile = Profile(sector=s.sector, stage=stage, fundingAskIdr=ask, oneLiner=s.one_liner)
    score = compute_score(rules.weights, values)
    category = categorize(score, rules.thresholds)
    if category != grade:  # _pick_values draws from this grade only
        raise AssertionError(f"{s.name}: {category} != {grade}")
    fit = fit_check(profile, rules.fit)
    steps_spec += [
        ("Menilai 5 kriteria", "gemini.generate_content", StepActor.model,
         {"durationMs": rng.randint(18_000, 85_000), "model": rules.models.penilai,
          "read": f"proposalTexts/{pid}", "tokensIn": rng.randint(8_000, 20_000),
          "tokensOut": rng.randint(1_500, 4_000)}),
        ("Hitung skor", "kode", StepActor.kode, {"durationMs": rng.randint(1, 4), "read": rv}),
        ("Cek kecocokan", "kode", StepActor.kode, {"durationMs": rng.randint(1, 3), "read": rv}),
        ("Tentukan grade", "kode", StepActor.kode, {"durationMs": rng.randint(1, 2), "read": rv}),
        ("Simpan hasil penilaian", "firestore", StepActor.kode,
         {"durationMs": rng.randint(80, 260), "wrote": f"proposals/{pid}"}),
    ]
    job, steps = _penilaian_job(rng, pid, s.name, created, rules, steps_spec)
    assessed = job.endedAt
    response = None
    if respond:
        response = _response(rng, category, fit.passed, assessed, now)
    proposal = Proposal(
        name=s.name, nameLower=s.name.lower(), source=source, founder=founder_doc, consent=True,
        status=ProposalStatus.dinilai, pageCount=page_count, profile=profile,
        assessment=Assessment(criteria=criteria, score=score, rulesVersion=rules.version,
                              model=rules.models.penilai),
        fit=fit, category=category, effectiveCategory=category, response=response,
        responded=response is not None,
        tokens=Tokens(**{"in": job.tokensIn, "out": job.tokensOut}), jobId=jid,
        createdAt=created, updatedAt=response.at if response else assessed, assessedAt=assessed)
    masuk = History(at=assessed, via=Via.sistem, action="proposal_masuk", proposalId=pid,
                    proposalName=s.name, after=category.value,
                    detail=f"Proposal {s.name} masuk: skor {fmt_score(score)}, "
                           f"{CATEGORY_LABEL[category]}" + ("" if fit.passed else ", di luar fokus"))
    docs += [(f"proposals/{pid}", to_doc(proposal)),
             (f"proposalTexts/{pid}", to_doc(ProposalText(pages=pages,
                                                          charCount=sum(map(len, pages))))),
             *_job_docs(jid, job, steps),
             (f"history/{PREFIX}masuk-{s.slug}", to_doc(masuk))]
    if response:
        docs.append((f"history/{PREFIX}tanggapan-{s.slug}", to_doc(History(
            at=response.at, via=response.via, action="tanggapan", proposalId=pid,
            proposalName=s.name, before=None, after=response.kind, reason=response.note,
            detail=f"{str(response.kind).capitalize()} {s.name}"))))
    planned = Planned(pid, s, created, assessed, proposal, False)
    return Unit(f"proposal {s.name} ({category.value}, skor {fmt_score(score)})",
                f"proposals/{pid}", docs), planned


def _response(rng: random.Random, cat: Category, in_focus: bool, assessed: datetime,
              now: datetime) -> Response | None:
    good = cat in (Category.sangat_layak, Category.layak_bersyarat)
    mid = cat == Category.perlu_penyesuaian
    p_setuju = (0.9 if good else 0.5 if mid else 0.1) * (1 if in_focus else 0.3)
    kind = ResponseKind.setuju if rng.random() < p_setuju else ResponseKind.tolak
    at = (assessed + timedelta(hours=rng.uniform(3, 48))).astimezone(db.WIB)
    if not 8 <= at.hour < 21:  # the manager answers in working hours
        day = at.date() + timedelta(days=1 if at.hour >= 21 else 0)
        at = _wib(day, rng.randint(8, 10), rng.randint(0, 59))
    if at >= now - timedelta(hours=1):
        return None
    note = rng.choice(SETUJU_NOTES if kind == ResponseKind.setuju else TOLAK_NOTES)
    return Response(kind=kind, at=at, via=Via.wa if rng.random() < 0.6 else Via.dashboard,
                    note=note)


def _asisten_unit(rng: random.Random, offset: int, k: int, day: date, model: str) -> Unit:
    jid = f"{PREFIX}asisten-d{offset:02d}-{k}"
    t = _wib(day, rng.randint(10, 20), rng.randint(0, 59), rng.randint(0, 59))
    started = t
    steps: list[Step] = []
    for seq in range(1, rng.randint(1, 2) + 1):
        name, args = ASK_TOOLS[rng.randrange(len(ASK_TOOLS))]
        dur = rng.randint(1_500, 4_500)
        t += timedelta(milliseconds=dur)
        steps.append(Step(seq=seq, at=t, action=f"Memanggil {name}", tool=name,
                          actor=StepActor.model, model=model, read=json.dumps(args, ensure_ascii=False),
                          tokensIn=rng.randint(2_500, 6_000), tokensOut=rng.randint(40, 160),
                          durationMs=dur))
    dur = rng.randint(3_000, 9_000)
    t += timedelta(milliseconds=dur)
    steps.append(Step(seq=len(steps) + 1, at=t, action="Menjawab pertanyaan",
                      tool="agent_runtime", actor=StepActor.model, model=model,
                      read="data AISA (tools baca)", tokensIn=rng.randint(4_000, 9_000),
                      tokensOut=rng.randint(250, 800), durationMs=dur))
    end = t + timedelta(milliseconds=rng.randint(50, 300))
    job = Job(kind=JobKind.asisten, agent="Asisten", title="Menjawab pertanyaan manajer",
              model=model, status=JobStatus.selesai, startedAt=started, endedAt=end,
              durationMs=int((end - started).total_seconds() * 1000), stepCount=len(steps),
              tokensIn=sum(s.tokensIn for s in steps), tokensOut=sum(s.tokensOut for s in steps))
    return Unit(f"asisten {day} #{k}", f"jobs/{jid}", _job_docs(jid, job, steps))


def _as_of(p: Planned, at: datetime) -> Proposal:
    """The proposal as it stood at `at`: a decision given later is not there yet."""
    if p.doc.response and p.doc.response.at > at:
        return p.doc.model_copy(update={"response": None, "responded": False})
    return p.doc


def _digest_unit(rng: random.Random, offset: int, day: date, weekly: bool,
                 planned: list[Planned], rules: Rules) -> Unit:
    slot = "17.00" if weekly else "09.00"
    did = f"{PREFIX}d{offset:02d}-{slot.replace('.', '')}"
    jid = f"{PREFIX}ringkasan-d{offset:02d}-{slot.replace('.', '')}"
    sent = _wib(day, 17 if weekly else 9, 0, rng.randint(5, 40))
    s = settings()
    seen_now = [(p, _as_of(p, sent)) for p in planned if p.created <= sent]

    if weekly:
        rows = [Row(id=p.pid, name=d.name, at=d.createdAt, status=d.status,
                    sector=d.profile.sector,
                    category=d.effectiveCategory if d.status == ProposalStatus.dinilai else None,
                    score=d.assessment.score if d.assessment else None,
                    out_of_focus=bool(d.fit and not d.fit.passed), responded=d.responded,
                    response_kind=d.response.kind if d.response else None,
                    response_at=d.response.at if d.response else None)
                for p, d in seen_now]
        stats, top = weekly_stats(rows, sent)
        data = WeeklyData(salutation=s.manager_salutation, window_start=week_start(sent),
                          stats=stats, top=top, counts_=weekly_counts(rows, stats), at=sent,
                          manager_name=s.manager_name)
        cands = weekly_candidates(stats, sent)
        data.insight = weekly_template_insight(cands)
        text, counts, ids = weekly_template(data), data.counts(), [r.id for r in top]
        window_start, period = data.window_start, WEEKLY
        extra = {"week": data.week(), "weekly": stats}
        detail = (f"Ringkasan mingguan terkirim ({stats.proposalsIn} masuk minggu ini, "
                  f"{data.belum} menunggu keputusan)")
    else:
        window_start = sent - timedelta(hours=24)
        groups: dict[Category, list[Item]] = {c: [] for c in Category}
        manual: list[Item] = []
        seen: list[Seen] = []
        ids: list[str] = []
        for p, d in seen_now:
            assessed = d.status == ProposalStatus.dinilai
            seen.append(Seen(at=d.createdAt, sector=d.profile.sector, category=d.effectiveCategory,
                             score=d.assessment.score if assessed and d.assessment else None,
                             responded=d.responded,
                             out_of_focus=assessed and bool(d.fit and not d.fit.passed)))
            if d.responded:
                continue
            if assessed:
                top2 = sorted(d.assessment.criteria.items(), key=lambda kv: kv[1].value,
                              reverse=True)[:2]
                groups[Category(d.effectiveCategory)].append(Item(
                    id=p.pid, name=d.name, score=d.assessment.score, sector=d.profile.sector,
                    fundingAskIdr=d.profile.fundingAskIdr, oneLiner=d.profile.oneLiner,
                    reasons=[r.reason for _, r in top2], out_of_focus=not d.fit.passed))
            else:
                manual.append(Item(id=p.pid, name=d.name, score=0.0))
            ids.append(p.pid)
        for v in groups.values():
            v.sort(key=rank_key)
        baru = sum(1 for x in seen if x.at and x.at >= window_start)
        data = DigestData(slot=slot, salutation=s.manager_salutation, window_start=window_start,
                          groups=groups, manual=manual, baru_masuk=baru,
                          manager_name=s.manager_name, at=sent)
        data.insight = template_insight(insight_candidates(seen, data, sent))
        text, counts, period = template(data), data.counts(), DAILY
        extra = {}
        detail = f"Ringkasan {slot} terkirim ({data.belum} belum ditanggapi)"

    start = sent - timedelta(seconds=rng.randint(12, 25))
    t = start
    steps: list[Step] = []

    def add(action, tool, actor, dur, **kw):
        nonlocal t
        t += timedelta(milliseconds=dur)
        steps.append(Step(seq=len(steps) + 1, at=t, action=action, tool=tool, actor=actor,
                          durationMs=dur, **kw))

    add(period.collect_step, "firestore", StepActor.kode, rng.randint(150, 600), read="proposals")
    if data.insight:
        add("Menulis insight", "gemini.generate_content", StepActor.model, rng.randint(2_000, 4_500),
            model=rules.models.insight, read="kandidat insight",
            tokensIn=rng.randint(900, 1_800), tokensOut=rng.randint(60, 160))
    add("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model,
        rng.randint(4_000, 9_000), model=rules.models.ringkasan, read="data ringkasan",
        tokensIn=rng.randint(2_200, 4_800), tokensOut=rng.randint(300, 750))
    add("Cek angka di ringkasan", "kode", StepActor.kode, rng.randint(1, 6))
    add("Kirim WhatsApp", "gowa.send_message", StepActor.kode, rng.randint(400, 1_200),
        wrote="WhatsApp manajer")
    end = t + timedelta(milliseconds=rng.randint(40, 150))
    job = Job(kind=JobKind.ringkasan, agent="Pembuat ringkasan", title=period.title,
              model=rules.models.ringkasan, digestId=did, status=JobStatus.selesai,
              startedAt=start, endedAt=end, durationMs=int((end - start).total_seconds() * 1000),
              stepCount=len(steps), tokensIn=sum(x.tokensIn for x in steps),
              tokensOut=sum(x.tokensOut for x in steps))
    digest = Digest(slot=slot, period=period.name, windowStart=window_start, sentAt=sent,
                    text=text, counts=counts, proposalIds=ids, usedTemplate=False,
                    insight=data.insight, jobId=jid, gowaMessageIds=[f"{did}-wa"], **extra)
    history = History(at=end, via=Via.sistem, action="ringkasan_terkirim", detail=detail)
    return Unit(f"ringkasan {slot} {day}", f"jobs/{jid}",
                [*_job_docs(jid, job, steps), (f"digests/{did}", to_doc(digest)),
                 (f"history/{did}-terkirim", to_doc(history))])


MIN_WEEKLY_RISE = 3.0  # this week's mean score beats last week's by at least this much


def _weekly_rise(planned: list[Planned], now: datetime) -> float:
    def mean(lo: int, hi: int) -> float:
        xs = [p.doc.assessment.score for p in planned
              if p.doc.assessment and lo <= (now - p.created).days < hi]
        return sum(xs) / len(xs) if xs else 0.0
    return mean(0, 7) - mean(7, 14)


def build_plan(rules: Rules, now: datetime) -> tuple[list[Unit], list[Planned]]:
    """Every unit to write, oldest first. Pure: the same rules and the same WIB day give the
    same docs. The first seed from RNG_SEED on whose draw the mean score rises week over week
    is used, so the score chart tells the same story whichever day it runs."""
    for k in range(50):
        units, planned = _plan(rules, now, random.Random(RNG_SEED + k))
        if _weekly_rise(planned, now) >= MIN_WEEKLY_RISE:
            break
    return units, planned


def _plan(rules: Rules, now: datetime, rng: random.Random) -> tuple[list[Unit], list[Planned]]:
    vectors = _vectors(rules)
    today = now.astimezone(db.WIB).date()
    days = [today - timedelta(days=o) for o in range(DAYS_BACK, 0, -1)]
    counts = _day_counts(rng, days)

    # Arrival times, oldest first; each day's proposals spread over 09–20 WIB.
    arrivals: list[tuple[int, datetime]] = []
    for d, n in zip(days, counts, strict=True):
        hours = sorted(rng.sample(range(9, 21), n))
        for h in hours:
            arrivals.append(((today - d).days, _wib(d, h, rng.randint(0, 59), rng.randint(0, 59))))

    # Grades lean better over the two weeks (so the mean score drifts up), with noise.
    grades = [c for c, n in GRADE_QUOTA.items() for _ in range(n)]
    rank = {c: i for i, c in enumerate(reversed(list(Category)))}  # tidak_layak 0 … sangat 4
    grades.sort(key=lambda c: rank[c] + rng.gauss(0, NOISE))
    manual_at = set(rng.sample(range(2, len(arrivals)), MANUAL))
    order: list[Category | None] = []
    it = iter(grades)
    for i in range(len(arrivals)):
        order.append(None if i in manual_at else next(it))

    startups = list(CATALOG)
    rng.shuffle(startups)
    units: list[Unit] = []
    planned: list[Planned] = []
    for i, ((offset, created), grade) in enumerate(zip(arrivals, order, strict=True)):
        s = startups[i]
        respond = grade is not None and offset >= RESPOND_MIN_AGE_DAYS and rng.random() < 0.55
        unit, p = _proposal_unit(rng, vectors, rules, s, CATALOG.index(s), created, grade, now,
                                 respond, manual_variant=sum(x.manual for x in planned))
        units.append(unit)
        planned.append(p)

    asisten_model = settings().assistant_model
    for d in days:
        offset = (today - d).days
        units.append(_digest_unit(rng, offset, d, False, planned, rules))
        if d.weekday() == 4:
            units.append(_digest_unit(rng, offset, d, True, planned, rules))
        asks = rng.choice((0, 1)) if d.weekday() >= 5 else rng.randint(1, 3)
        for k in range(1, asks + 1):
            units.append(_asisten_unit(rng, offset, k, d, asisten_model))
    return units, planned


# ---------- dailyStats contributions, read back from the docs themselves ----------

Delta = dict[str, dict[str, Any]]  # WIB date → counters


def _bump(out: Delta, day: str, path: tuple[str, ...], n: int) -> None:
    cur = out.setdefault(day, {})
    for k in path[:-1]:
        cur = cur.setdefault(k, {})
    cur[path[-1]] = cur.get(path[-1], 0) + n


def contribution(docs: dict[str, dict]) -> Delta:
    """What intake and `JobLog.finish` add to `dailyStats` for these docs: per proposal its
    arrival, grade, sector or manual flag on its WIB day; per job its tokens, model calls and
    per-kind tokens on the WIB day it ended. Model calls are the job's model steps."""
    out: Delta = {}
    for path, d in docs.items():
        parts = path.split("/")
        if parts[0] == "proposals" and len(parts) == 2:
            day = db.wib_date(d["createdAt"])
            _bump(out, day, ("proposalsIn",), 1)
            if d.get("status") == ProposalStatus.perlu_dicek_manual.value:
                _bump(out, day, ("perluDicekManual",), 1)
            elif d.get("category"):
                _bump(out, day, ("byCategory", d["category"]), 1)
                if (d.get("profile") or {}).get("sector"):
                    _bump(out, day, ("bySector", d["profile"]["sector"]), 1)
        elif parts[0] == "jobs" and len(parts) == 2:
            calls = sum(1 for p, s in docs.items()
                        if p.startswith(f"{path}/steps/") and s.get("actor") == StepActor.model.value)
            tin, tout = d.get("tokensIn", 0), d.get("tokensOut", 0)
            if not (tin or tout or calls):
                continue
            day = db.wib_date(d["endedAt"])
            _bump(out, day, ("tokensIn",), tin)
            _bump(out, day, ("tokensOut",), tout)
            _bump(out, day, ("modelCalls",), calls)
            _bump(out, day, ("tokensByKind", d["kind"], "in"), tin)
            _bump(out, day, ("tokensByKind", d["kind"], "out"), tout)
    return out


def _add(stored: dict, delta: dict, sign: int, nested: bool = False) -> dict:
    """`stored` with every counter in `delta` moved by sign × delta. Inside a map
    (`byCategory`, `bySector`, `tokensByKind`) a key that reaches zero is dropped, so a removed
    demo sector leaves no empty chart row behind; a top-level counter keeps its zero."""
    out = dict(stored)
    for k, v in delta.items():
        if isinstance(v, dict):
            sub = _add(out.get(k) or {}, v, sign, nested=True)
            if sub or not nested and k in stored:
                out[k] = sub
            else:
                out.pop(k, None)
        else:
            n = (out.get(k) or 0) + sign * v
            if n or not nested:
                out[k] = n
            else:
                out.pop(k, None)
    return out


def _empty(stats: dict) -> bool:
    return not any(v for k, v in stats.items() if k != "date")


def _apply_stats(tx, delta: Delta, sign: int) -> None:
    """Read every touched `dailyStats` doc in `tx` and write it back moved by the delta."""
    fs = db.client()
    refs = {day: fs.document(f"dailyStats/{day}") for day in delta}
    current = {day: ref.get(transaction=tx).to_dict() or {} for day, ref in refs.items()}
    for day, ref in refs.items():
        new = _add({k: v for k, v in current[day].items() if k != "date"}, delta[day], sign)
        if _empty(new):
            tx.delete(ref)
        else:
            tx.set(ref, {"date": day, **new})


# ---------- apply / remove ----------

def _write_unit(unit: Unit) -> bool:
    fs = db.client()
    primary = fs.document(unit.primary)
    docs = dict(unit.docs)
    delta = contribution(docs)

    @firestore.transactional
    def run(tx) -> bool:
        if primary.get(transaction=tx).exists:
            return False
        _apply_stats(tx, delta, +1)  # reads first: a transaction reads before it writes
        for path, doc in unit.docs:
            tx.set(fs.document(path), doc)
        return True

    return run(fs.transaction())


def _demo_ids(collection: str) -> list[str]:
    return sorted(s.id for s in db.client().collection(collection).stream()
                  if s.id.startswith(PREFIX))


def _steps_of(jid: str) -> dict[str, dict]:
    return {f"jobs/{jid}/steps/{s.id}": s.to_dict() or {}
            for s in db.client().collection(f"jobs/{jid}/steps").stream()}


def _remove_unit(primary: str, paths: list[str]) -> bool:
    """Delete one unit and subtract what it added, both in one transaction. The amounts come
    from the docs as stored, so a unit written by an earlier day's run comes out exactly."""
    fs = db.client()
    steps: dict[str, dict] = {}
    for p in paths:
        if p.startswith("jobs/") and p.count("/") == 1:
            steps.update(_steps_of(p.split("/")[1]))

    @firestore.transactional
    def run(tx) -> bool:
        snaps = {p: fs.document(p).get(transaction=tx) for p in paths}
        if not snaps[primary].exists:
            return False
        docs = {p: s.to_dict() for p, s in snaps.items() if s.exists}
        _apply_stats(tx, contribution({**docs, **steps}), -1)
        for p in [*docs, *steps]:
            tx.delete(fs.document(p))
        return True

    return run(fs.transaction())


def _existing_digest_slots() -> set[str]:
    """`<WIB date>-<slot>` of every real digest, so a demo digest never doubles a real one."""
    return {s.id for s in db.client().collection("digests").stream() if not s.id.startswith(PREFIX)}


def _real_slot(unit: Unit, real: set[str]) -> bool:
    for path, doc in unit.docs:
        if path.startswith("digests/"):
            key = f"{db.wib_date(doc['sentAt'])}-{doc['slot'].replace('.', '')}"
            return key in real
    return False


def seed(apply: bool = False, now: datetime | None = None,
         out: Callable[[str], None] = print) -> dict[str, Any]:
    now = now or db.now()
    out(f"seed-demo: {'MENJALANKAN' if apply else 'RENCANA (dry-run: tidak ada yang ditulis)'}")
    rules = db.load_rules()
    units, planned = build_plan(rules, now)
    real = _existing_digest_slots()
    fs = db.client()

    created = skipped = clash = 0
    per_coll: dict[str, int] = {}
    for unit in units:
        if _real_slot(unit, real):
            clash += 1
            continue
        if not apply:
            if fs.document(unit.primary).get().exists:
                skipped += 1
                continue
            created += 1
        elif _write_unit(unit):
            created += 1
        else:
            skipped += 1
            continue
        for path, _ in unit.docs:
            coll = path.split("/")[0] if path.count("/") == 1 else "jobs/*/steps"
            per_coll[coll] = per_coll.get(coll, 0) + 1

    graded = [p for p in planned if not p.manual]
    half = len(graded) // 2
    avg = lambda ps: round(sum(p.doc.assessment.score for p in ps) / len(ps), 1)
    grades: dict[str, int] = {}
    for p in graded:
        grades[p.doc.category] = grades.get(p.doc.category, 0) + 1
    s = settings()
    out(f"Sapaan di teks ringkasan: {(s.manager_salutation + ' ' + s.manager_name).strip()} "
        "(MANAGER_SALUTATION / MANAGER_NAME)")
    out(f"Aturan versi {rules.version}; {len(planned)} proposal ({len(graded)} dinilai, "
        f"{len(planned) - len(graded)} perlu dicek manual), "
        f"{sum(1 for p in planned if p.doc.responded)} sudah ditanggapi.")
    out("Grade: " + ", ".join(f"{c.value} {grades.get(c.value, 0)}" for c in Category))
    out(f"Rata-rata skor: paruh awal {avg(graded[:half])}, paruh akhir {avg(graded[half:])}.")
    out(f"Di luar fokus: {sum(1 for p in graded if not p.doc.fit.passed)}.")
    verb = "ditulis" if apply else "akan ditulis"
    out(f"Unit {verb}: {created}; sudah ada (dilewati): {skipped}; "
        f"slot ringkasan yang sudah punya ringkasan asli (dilewati): {clash}.")
    for coll in sorted(per_coll):
        out(f"  {coll}: {per_coll[coll]} dok")
    if not apply:
        out("Tidak ada yang ditulis. Jalankan dengan --apply untuk menulis.")
    return {"apply": apply, "units": created, "skipped": skipped, "realSlot": clash,
            "docs": per_coll, "proposals": len(planned)}


def remove(apply: bool = False, out: Callable[[str], None] = print) -> dict[str, Any]:
    out(f"seed-demo --remove: {'MENJALANKAN' if apply else 'RENCANA (dry-run: tidak ada yang dihapus)'}")
    fs = db.client()
    removed = 0
    units: list[tuple[str, list[str]]] = []
    for pid in _demo_ids("proposals"):
        d = fs.document(f"proposals/{pid}").get().to_dict() or {}
        slug = pid.removeprefix(PREFIX)
        paths = [f"proposals/{pid}", f"proposalTexts/{pid}",
                 f"history/{PREFIX}masuk-{slug}", f"history/{PREFIX}tanggapan-{slug}"]
        if (jid := d.get("jobId")) and jid.startswith(PREFIX):
            paths.append(f"jobs/{jid}")
        units.append((f"proposals/{pid}", paths))
    claimed = {p for _, ps in units for p in ps}
    for jid in _demo_ids("jobs"):
        if f"jobs/{jid}" in claimed:
            continue
        d = fs.document(f"jobs/{jid}").get().to_dict() or {}
        paths = [f"jobs/{jid}"]
        if (did := d.get("digestId")) and did.startswith(PREFIX):
            paths += [f"digests/{did}", f"history/{did}-terkirim"]
        units.append((f"jobs/{jid}", paths))

    out(f"Unit demo: {len(units)} ({sum(1 for p, _ in units if p.startswith('proposals/'))} "
        "proposal, sisanya pekerjaan AI)")
    if apply:
        for primary, paths in units:
            removed += _remove_unit(primary, paths)
    # Anything left with the prefix carries no aggregate (a stray text, row or digest).
    leftovers = [f"{c}/{i}" for c in COLLECTIONS for i in _demo_ids(c)]
    if not apply:
        leftovers = [p for p in leftovers if p not in {q for _, ps in units for q in ps}]
    out(f"Dokumen demo lain tanpa agregat: {len(leftovers)}")
    if apply:
        batch = fs.batch()
        for n, p in enumerate(leftovers, 1):
            for sp in (_steps_of(p.split("/")[1]) if p.startswith("jobs/") else {}):
                batch.delete(fs.document(sp))
            batch.delete(fs.document(p))
            if n % 200 == 0:
                batch.commit()
                batch = fs.batch()
        batch.commit()
        out(f"Dihapus: {removed} unit dan {len(leftovers)} dokumen lain; dailyStats dikurangi "
            "sebanyak yang ditambahkan.")
    else:
        out("Tidak ada yang dihapus. Jalankan dengan --remove --apply untuk menghapus.")
    return {"apply": apply, "units": len(units), "removed": removed, "leftovers": len(leftovers)}
