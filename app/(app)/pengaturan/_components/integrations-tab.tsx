import { ChevronRightIcon } from 'lucide-react'
import { Fragment } from 'react'

import { IntegrationCard, type Integration } from './integration-card'
import { RuntimePanel } from './runtime-toggle'
import { SettingsPanel } from './settings-panel'

const FLOW = [
  { title: 'Google Form', text: 'Founder mengirim proposal' },
  { title: 'Google Drive', text: 'Berkas proposal disimpan' },
  { title: 'aisa-api', text: 'Teks dibaca, lalu dinilai AI' },
  { title: 'Firestore', text: 'Hasil dan aturan disimpan' },
  { title: 'GOWA', text: 'Ringkasan masuk WhatsApp' },
]

export function IntegrationsTab({
  integrations,
  runtime,
}: {
  integrations: Integration[]
  runtime: { paused: boolean; detail: string; canConfigure: boolean }
}) {
  const checked = integrations.filter((i) => i.status !== null)
  const connected = checked.filter((i) => i.status === 'terhubung').length

  return (
    <div className="space-y-5">
      <RuntimePanel {...runtime} />

      <SettingsPanel
        title="Cara proposal mengalir"
        description="Dari formulir founder sampai ringkasan di WhatsApp. Semua berjalan otomatis."
      >
        <ol className="grid gap-2 p-5 md:grid-cols-[repeat(9,auto)] md:items-start md:gap-1.5">
          {FLOW.map((step, index) => (
            <Fragment key={step.title}>
              <li className="flex items-center gap-3 md:block md:min-w-0 md:text-center">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary md:mx-auto md:mb-2">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {step.title}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {step.text}
                  </span>
                </span>
              </li>
              {index < FLOW.length - 1 && (
                <li
                  aria-hidden
                  className="hidden pt-1.5 text-muted-foreground md:block"
                >
                  <ChevronRightIcon className="size-4" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </SettingsPanel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight">
            Layanan terhubung
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {connected} dari {checked.length} layanan yang bisa dicek dari
            dashboard terhubung
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      </section>
    </div>
  )
}
