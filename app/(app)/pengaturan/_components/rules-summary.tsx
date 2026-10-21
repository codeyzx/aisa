import { CRITERION_LABEL } from '@/features/aisa/aisa.labels'
import { CRITERIA, type Rules } from '@/features/aisa/aisa.schema'
import { formatRupiah } from '@/lib/format/currency'
import { formatNumber } from '@/lib/format/number'

import {
  ASISTEN_MODEL_NOTE,
  EDITABLE_MODEL_LABEL,
  RETENTION_EXPLANATION,
  THRESHOLD_LABEL,
} from './rules-labels'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Every active rule, read-only — what a seat without `aisa:configure` sees in
 * place of the form, so the rules that score proposals are never hidden.
 */
export function RulesSummary({ rules }: { rules: Rules }) {
  return (
    <div className="space-y-6 text-sm">
      <Section title="Patokan nilai">
        <dl className="space-y-2">
          {CRITERIA.map((c) => (
            <div key={c} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">{CRITERION_LABEL[c]}</dt>
              <dd className="space-y-0.5">
                {(['1', '3', '5'] as const).map((level) => (
                  <p key={level}>
                    <span className="text-muted-foreground">
                      Nilai {level}:
                    </span>{' '}
                    {rules.anchors[c][level]}
                  </p>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Cek kecocokan">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Sektor fokus</dt>
            <dd>{rules.fit.sectors.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tahap pendanaan</dt>
            <dd>{rules.fit.stages.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Besar dana</dt>
            <dd>
              {formatRupiah(rules.fit.fundingMinIdr)}–
              {formatRupiah(rules.fit.fundingMaxIdr)}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Batas kategori (skor)">
        <dl className="grid gap-3 sm:grid-cols-5">
          {(Object.keys(THRESHOLD_LABEL) as (keyof Rules['thresholds'])[]).map(
            (key) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">
                  {THRESHOLD_LABEL[key]}
                </dt>
                <dd className="tabular-nums">{rules.thresholds[key]}</dd>
              </div>
            ),
          )}
          <div>
            <dt className="text-xs text-muted-foreground">
              Minimum karakter per halaman
            </dt>
            <dd className="tabular-nums">
              {formatNumber(rules.minCharsPerPage)}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Model">
        <dl className="grid gap-3 sm:grid-cols-4">
          {(
            Object.keys(EDITABLE_MODEL_LABEL) as (keyof Rules['models'] &
              keyof typeof EDITABLE_MODEL_LABEL)[]
          ).map((key) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {EDITABLE_MODEL_LABEL[key]}
              </dt>
              <dd>
                <code>{rules.models[key]}</code>
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">Asisten</dt>
            <dd>
              <code>{rules.models.asisten}</code>
              <p className="text-xs text-muted-foreground">
                {ASISTEN_MODEL_NOTE}
              </p>
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Retensi">
        <p>
          <span className="tabular-nums">{rules.retentionDays}</span> hari —{' '}
          <span className="text-muted-foreground">
            {RETENTION_EXPLANATION(rules.retentionDays)}
          </span>
        </p>
      </Section>
    </div>
  )
}
