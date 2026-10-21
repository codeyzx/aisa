/**
 * AISA founder intake: Google Form -> Drive -> this script -> aisa-api POST /intake/form.
 *
 * This script is bound to the Form (Extensions > Apps Script from inside the Form).
 * Setup steps: docs/how-to/setup-google-form.md.
 *
 * Script properties (Project Settings > Script properties):
 *   AISA_API_URL   base URL of aisa-api, without a trailing /intake/form
 *   INTAKE_SECRET  same value as the aisa-api INTAKE_SECRET (Secret Manager: intake-secret)
 *
 * The request is signed exactly as aisa-api checks it: X-AISA-Signature: sha256=<hex of
 * HMAC-SHA256(raw body bytes, INTAKE_SECRET)>. The bytes that are signed are the bytes
 * that are sent, so the signature cannot drift from the body.
 *
 * Drive access: this script does NOT share files. aisa-api downloads the deck with its own
 * service account, so the Form's upload folder must be shared with that account as
 * Viewer (files inherit the folder's sharing). Sharing per file would need the full
 * `drive` scope instead of `drive.readonly`.
 */

// Item titles the handler reads. setupForm() creates these items with these titles; if
// you rename an item in the Form, rename it here too, or the submission is rejected.
const TITLES = {
  startupName: 'Nama startup',
  founderName: 'Nama founder',
  founderEmail: 'Email founder',
  consent: 'Persetujuan',
}

const CONSENT_CHOICE =
  'Saya sudah membaca pemberitahuan di atas dan setuju data saya diproses untuk tujuan tersebut.'

// Shown to founders in the purpose notice. RETENTION matches aisa-api's default
// rules.retentionDays (90): archived proposals are deleted by the daily retention job.
const ORG_NAME = 'Aixel'
const RETENTION = '90 hari'
const CONTACT = 'luthfi@aixel.id'

const PURPOSE_NOTICE = () =>
  [
    'Pemberitahuan tujuan pemrosesan data pribadi (UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi)',
    '',
    'Data yang kami minta hanya: nama startup, nama dan email founder, serta pitch deck (PDF).',
    'Tujuan: data dipakai hanya untuk menyaring proposal investasi yang masuk ke ' +
      ORG_NAME +
      '.',
    'Teks pitch deck dibaca per halaman dan dinilai dengan bantuan AI; keputusan menanggapi ' +
      'proposal tetap diambil oleh manajer investasi.',
    'Data Anda tidak dipakai untuk melatih model AI.',
    'Retensi: proposal yang diarsipkan dihapus setelah ' +
      RETENTION +
      ', atau lebih cepat atas permintaan Anda melalui ' +
      CONTACT +
      '.',
  ].join('\n')

/**
 * Adds the intake items to this Form. FormApp cannot create a file-upload item, so the
 * pitch-deck question is added by hand — before or after this runs. The Form may hold
 * nothing but file-upload items; any other item means it was already set up, and this
 * refuses rather than add a second set of questions.
 */
function setupForm() {
  const form = FormApp.getActiveForm()
  const existing = form.getItems()
  const uploads = existing.filter(
    (it) => it.getType() === FormApp.ItemType.FILE_UPLOAD,
  )
  if (existing.length > uploads.length) {
    throw new Error(
      'Form sudah berisi pertanyaan selain unggah file. setupForm() hanya untuk form kosong.',
    )
  }
  form
    .setTitle('Pengajuan proposal startup')
    .setDescription(PURPOSE_NOTICE())
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setLimitOneResponsePerUser(false)

  form.addTextItem().setTitle(TITLES.startupName).setRequired(true)
  form.addTextItem().setTitle(TITLES.founderName).setRequired(true)
  form
    .addTextItem()
    .setTitle(TITLES.founderEmail)
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build())
  form
    .addCheckboxItem()
    .setTitle(TITLES.consent)
    .setHelpText('Wajib. Proposal tanpa persetujuan tidak diproses.')
    .setChoiceValues([CONSENT_CHOICE])
    .setRequired(true)

  // Keep an upload question added earlier at the end, after the text questions.
  for (const it of uploads) form.moveItem(it, form.getItems().length - 1)

  console.log(
    uploads.length
      ? 'Form siap, termasuk pertanyaan unggah pitch deck.'
      : 'Form siap. Tambahkan pertanyaan "Upload file" untuk pitch deck secara manual.',
  )
}

/** Creates (or recreates) the installable onFormSubmit trigger for this Form. */
function installTrigger() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(t)
  }
  ScriptApp.newTrigger('onFormSubmit')
    .forForm(FormApp.getActiveForm())
    .onFormSubmit()
    .create()
  console.log('Trigger onFormSubmit terpasang.')
}

/** Installable trigger handler. Throws on any failure so the execution shows as Failed. */
function onFormSubmit(e) {
  if (!e || !e.response)
    throw new Error('Jalankan lewat trigger form, bukan manual.')
  const response = e.response

  const byTitle = {}
  let fileIds = null
  for (const ir of response.getItemResponses()) {
    const item = ir.getItem()
    if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
      if (fileIds !== null)
        throw new Error('Form punya lebih dari satu pertanyaan unggah file.')
      fileIds = ir.getResponse() || []
    } else {
      byTitle[item.getTitle()] = ir.getResponse()
    }
  }
  if (!fileIds || fileIds.length !== 1) {
    throw new Error(
      'Butuh tepat satu pitch deck, diterima: ' +
        (fileIds ? fileIds.length : 0),
    )
  }
  const startupName = text_(byTitle[TITLES.startupName])
  if (!startupName)
    throw new Error(
      'Pertanyaan "' + TITLES.startupName + '" tidak ditemukan atau kosong.',
    )

  const driveFileId = fileIds[0]
  const consentAnswer = byTitle[TITLES.consent]
  const payload = {
    driveFileId: driveFileId,
    fileName: DriveApp.getFileById(driveFileId).getName(),
    startupName: startupName,
    founderName: text_(byTitle[TITLES.founderName]),
    founderEmail: text_(byTitle[TITLES.founderEmail]),
    consent:
      Array.isArray(consentAnswer) &&
      consentAnswer.indexOf(CONSENT_CHOICE) !== -1,
    submittedAt: response.getTimestamp().toISOString(),
  }

  const res = postSigned_(payload)
  console.log(
    'intake/form ' + res.code + ' driveFileId=' + driveFileId + ' ' + res.text,
  )
  if (res.code !== 202)
    throw new Error('aisa-api menolak (' + res.code + '): ' + res.text)
}

/**
 * Connectivity + secret check with no side effect: sends a correctly signed body with
 * consent=false. 422 means the signature was accepted (aisa-api refuses unconsented
 * proposals before writing anything); 401 means INTAKE_SECRET does not match.
 */
function testSignedPing() {
  const res = postSigned_({
    driveFileId: 'aisa-ping-' + Date.now(),
    fileName: 'ping.pdf',
    startupName: 'Ping',
    founderName: null,
    founderEmail: null,
    consent: false,
    submittedAt: new Date().toISOString(),
  })
  const verdict =
    res.code === 422
      ? 'OK: tanda tangan diterima'
      : res.code === 401
        ? 'GAGAL: INTAKE_SECRET tidak cocok'
        : 'Tak terduga'
  console.log('testSignedPing ' + res.code + ' -> ' + verdict + ' ' + res.text)
}

function postSigned_(payload) {
  const props = PropertiesService.getScriptProperties()
  const base = (props.getProperty('AISA_API_URL') || '')
    .trim()
    .replace(/\/+$/, '')
  // aisa-api strips whitespace from its INTAKE_SECRET env value; strip here to match.
  const secret = (props.getProperty('INTAKE_SECRET') || '').trim()
  if (!base || !secret)
    throw new Error(
      'Script property AISA_API_URL dan INTAKE_SECRET wajib diisi.',
    )

  const body = Utilities.newBlob('')
    .setDataFromString(JSON.stringify(payload), 'UTF-8')
    .getBytes()
  const key = Utilities.newBlob('')
    .setDataFromString(secret, 'UTF-8')
    .getBytes()
  const signature =
    'sha256=' + toHex_(Utilities.computeHmacSha256Signature(body, key))

  const res = UrlFetchApp.fetch(base + '/intake/form', {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-AISA-Signature': signature },
    muteHttpExceptions: true,
    followRedirects: false,
  })
  return { code: res.getResponseCode(), text: res.getContentText() }
}

function text_(v) {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

// Apps Script returns signed bytes (-128..127).
function toHex_(bytes) {
  return bytes
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('')
}
