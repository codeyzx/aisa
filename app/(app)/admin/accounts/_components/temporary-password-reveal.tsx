'use client'

/**
 * The one-time display of a temporary password — the single most dangerous piece
 * of UI in this module, and the reason it is one component rather than two
 * copies: account creation and admin password reset both mint a credential, and
 * a second implementation is a second place for one of these rules to lapse.
 *
 * THE RULES, each with the failure it prevents:
 *
 *  - IT IS ONLY EVER RENDERED FROM AN ACTION RESULT. The caller mounts this
 *    component after `ok: true` and never before, so there is no state in which
 *    a password box exists on screen without a password having just been minted.
 *  - IT NEVER ENTERS A URL. The value arrives as a prop from client state held
 *    by the caller. It is not a search param, so it is not in the address bar,
 *    not in history, not in a referrer header, and not in a shared link.
 *  - IT IS MASKED BY DEFAULT. `type="password"`, revealed only by a deliberate
 *    press. An admin who creates an account on a shared screen or a call with
 *    screen-sharing running has not yet shown anyone anything.
 *  - IT CLEARS ON CLOSE AND ON NAVIGATION. `onDismiss` drops the caller's state;
 *    navigation unmounts the tree that holds it. Nothing persists it, so there
 *    is no "show it again" — a lost password is replaced by a new reset, which
 *    is a recorded, auditable act rather than a second look at a secret.
 *  - IT IS `readOnly`, not `disabled`: the value must stay selectable for a
 *    manual copy on a browser where the clipboard API is refused.
 *
 * The value is deliberately NOT auto-copied to the clipboard on mount. A
 * clipboard write the reader did not ask for outlives this screen by every
 * measure — it survives navigation, tab close, and sign-out, and lands in the
 * next thing they paste.
 */
import { useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TemporaryPasswordRevealProps {
  /** The minted credential. Held in the CALLER's state; never fetched here. */
  password: string
  /** Who it belongs to, so a screen with two panels open cannot be misread. */
  accountLabel: string
  /** Clears the caller's state — the "close" half of the one-time display. */
  onDismiss: () => void
}

export function TemporaryPasswordReveal({
  password,
  accountLabel,
  onDismiss,
}: TemporaryPasswordRevealProps) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  // Re-mask whenever a NEW password is shown (a second reset in the same
  // session): reveal is a decision about one credential, and inheriting it would
  // print the next one in plain text without anyone asking.
  useEffect(() => {
    setVisible(false)
    setCopied(false)
  }, [password])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // A refused clipboard (insecure context, denied permission) is not an
      // error worth a dialog — the value is on screen and selectable, which is
      // the fallback. Saying "copied" when nothing was copied would be worse.
      setCopied(false)
    }
  }

  // `Alert`'s default `role="alert"` is kept, not softened to `status`: this
  // panel appears once, carries a secret the reader must act on before it is
  // gone, and is the one thing on screen that cannot be recovered by scrolling
  // back. An assertive announcement is the honest register for it.
  return (
    <Alert>
      <AlertTitle>Kata sandi sementara untuk {accountLabel}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          Ini adalah <strong>satu-satunya</strong> kali kata sandi ini
          ditampilkan. Salin sekarang dan sampaikan langsung kepada pemilik
          akun. Setelah panel ini ditutup, kata sandi tidak dapat dilihat lagi —
          yang bisa dilakukan hanyalah menyetel ulang kata sandi sekali lagi.
        </p>
        <div className="flex w-full items-center gap-2">
          <Input
            readOnly
            aria-label={`Kata sandi sementara untuk ${accountLabel}`}
            type={visible ? 'text' : 'password'}
            value={password}
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={
              visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
            }
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Salin kata sandi"
            onClick={handleCopy}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Tutup dan hapus dari layar
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
