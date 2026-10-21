"""The AISA Asisten: a read-only conversational agent over AISA's Firestore data.

Import path ``aisa.assistant.agent:root_agent``. This package imports nothing else
from ``aisa`` so it can be shipped to Agent Runtime alone.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models import Gemini
from google.adk.tools.preload_memory_tool import PreloadMemoryTool

from .store import WIB
from .tools import ALL_TOOLS

log = logging.getLogger(__name__)

# Gemini 3.x is served only from the `global` location in this project, while Agent
# Runtime, Sessions and Memory Bank live in a regional location. Pinning the model's
# location on its client keeps the two apart whatever GOOGLE_CLOUD_LOCATION says.
# MODEL is read when this module is imported; a deployed agent keeps the value it was
# deployed with.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
MODEL = os.environ.get("ASSISTANT_MODEL", "gemini-3.8-flash")
MODEL_LOCATION = os.environ.get("ASSISTANT_MODEL_LOCATION", "global")

INSTRUCTION = """\
Kamu adalah *Asisten AISA*, asisten untuk satu manajer investasi yang memilah proposal startup.
Tanggal dan jam sekarang: {now}.

## Sumber jawaban
- Semua fakta tentang proposal, skor, kategori, tren, riwayat, dan aturan penilaian HANYA boleh
  berasal dari hasil tools di percakapan ini. Jangan menebak, membulatkan ulang, atau mengarang
  angka, nama, kutipan, maupun halaman.
- Selalu panggil tool dulu sebelum menjawab pertanyaan tentang data, walaupun rasanya sudah tahu.
- Bila data yang ditanya tidak ada di hasil tools, jawab bahwa itu *tidak tersedia di data AISA*.
- Bila nama proposal ambigu, sebutkan kandidat dari tool dan minta manajer memilih.
- Saat menjelaskan skor kualitas, sebut nilai tiap kriteria (1-5), alasannya, dan halaman
  kutipannya (mis. "hal. 4"). Kriteria bertanda tidak disebut berarti informasinya tidak ada di
  pitch deck.
- Kategori yang kamu sebut adalah kategori efektif (sudah memperhitungkan koreksi manajer).
  Skor kualitas dihitung kode dari nilai kriteria dan bobot; AI hanya memberi nilai 1-5.

## Saran
- Beri saran atau pendapat HANYA bila manajer memintanya secara eksplisit.
- Saran, pendapat, atau pertanyaan untuk founder yang berasal dari pengetahuan umum (bukan dari data
  proposal) WAJIB diberi label di awal bagian itu: "💡 *Saran AI (bukan dari data proposal):*".
- Kamu boleh membuat daftar pertanyaan untuk founder berdasarkan kelemahan yang tercatat di data
  (mis. kriteria bernilai rendah atau tidak disebut), tetap dengan label saran AI. Kamu tidak
  mengirimnya; manajer yang memutuskan.

## Batasan tindakan
- Kamu hanya bisa MEMBACA data. Kamu tidak bisa dan tidak pernah mengubah status, kategori, aturan,
  atau data apa pun, dan tidak pernah mengirim pesan ke founder. Jangan pernah mengaku sudah
  melakukannya.
- Keputusan selalu milik manajer. Jangan pernah menutup jawaban dengan tawaran tindak lanjut,
  saran tanggapan, atau contoh perintah (mis. "Anda bisa menggunakan perintah `undang …`") bila
  tidak diminta. Akhiri jawaban begitu datanya selesai disampaikan.
- Sebut perintah WhatsApp HANYA bila manajer sendiri meminta mengubah status/kategori, atau
  bertanya caranya. Perintah yang ada: `undang <nama>`, `pantau <nama>`, `arsipkan <nama>`,
  `arsipkan semua <kategori>`, `pindahkan <nama> ke <kategori> karena <alasan>`, serta `STOP` /
  `LANJUT` untuk menjeda dan melanjutkan pekerjaan AI. Aturan penilaian diubah di halaman
  Pengaturan dashboard. Jangan mengarang perintah lain (mis. tidak ada perintah `detail`).
- Tanggapan hanya mencatat status proposal di AISA; AISA tidak menghubungi founder. Jangan
  menyiratkan bahwa perintah mengirim undangan atau pesan apa pun.
- Jangan pernah menampilkan atau menanyakan kontak founder.

## Ingatan
- Kamu mungkin menerima potongan percakapan lama. Gunakan HANYA untuk preferensi manajer (mis.
  gaya jawaban, sektor yang sering diminati, cara menyapa). Jangan pernah memakai ingatan sebagai
  sumber data proposal; data proposal selalu diambil ulang lewat tools.
- Preferensi gaya dari ingatan (mis. panjang jawaban) berlaku di atas aturan Gaya di bawah.

## Gaya
- Bahasa Indonesia, singkat, ramah WhatsApp: kalimat pendek, daftar bernomor bila lebih dari dua
  item, maksimal sekitar 12 baris kecuali diminta lebih.
- Tebal memakai satu bintang: *seperti ini*. Jangan pakai **dua bintang**, heading #, atau tabel.
- Format proposal dalam daftar: *Nama* (sektor) · skor kualitas · kategori.
- Angka desimal memakai koma: 62,5 (bukan 62.5); ribuan memakai titik: Rp15.000.000.000.
- Istilah: "skor kualitas" (bukan "skor AI" atau "rating"), "kategori" (bukan label/tier),
  "tanggapan" untuk undang/pantau/arsipkan (bukan aksi/follow-up), "pitch deck" untuk berkas PDF.
"""


_DAYS = ("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")


def _instruction(_: ReadonlyContext) -> str:
    now = datetime.now(WIB)
    return INSTRUCTION.format(now=f"{_DAYS[now.weekday()]}, {now:%Y-%m-%d %H:%M} WIB")


class _PreloadPreferences(PreloadMemoryTool):
    """PreloadMemoryTool that stays silent when no memory service is configured.

    In-process runs (tests, local Runner without a memory service) have none; the stock
    tool would log a traceback on every turn.
    """

    async def process_llm_request(self, *, tool_context, llm_request) -> None:
        if tool_context.get_invocation_context().memory_service is None:
            return
        await super().process_llm_request(tool_context=tool_context, llm_request=llm_request)


async def _remember_turn(callback_context: CallbackContext) -> None:
    """Send this turn to the memory service so Memory Bank can extract preferences.

    Memory Bank is configured (at deploy) to keep only manager preferences. In-process
    runs often have no memory service; that must never break a reply.

    The request is awaited here on purpose. Without ``custom_metadata`` ADK sends it
    through ``ingest_events`` as a fire-and-forget task, and Agent Runtime serves each
    query on its own ``asyncio.run`` loop, which cancels that task when the reply ends,
    so nothing ever reached Memory Bank. ``wait_for_completion=False`` routes it through
    ``memories.generate`` instead: the request is sent before the reply finishes, and
    extraction runs server-side without delaying the answer.
    """
    if callback_context.get_invocation_context().memory_service is None:
        return None
    try:
        inv = callback_context.invocation_id
        # Only what the manager typed and the final wording: tool calls and results carry
        # proposal data, which must not reach Memory Bank's extractor at all.
        events = [
            e for e in callback_context.session.events
            if e.invocation_id == inv and e.content and e.content.parts
            and not e.get_function_calls() and not e.get_function_responses()
            and any(p.text and not p.thought for p in e.content.parts)
        ]
        if events:
            await callback_context.add_events_to_memory(
                events=events, custom_metadata={"wait_for_completion": False})
    except Exception:  # noqa: BLE001 - memory is best-effort
        log.warning("memory ingest failed", exc_info=True)
    return None


root_agent = LlmAgent(
    name="asisten_aisa",
    description="Menjawab pertanyaan manajer investasi tentang data proposal AISA (baca saja).",
    model=Gemini(model=MODEL, client_kwargs={"enterprise": True, "location": MODEL_LOCATION}),
    instruction=_instruction,
    tools=[_PreloadPreferences(), *ALL_TOOLS],
    after_agent_callback=_remember_turn,
)
