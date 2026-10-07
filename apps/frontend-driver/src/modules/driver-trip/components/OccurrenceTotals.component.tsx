/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatBrazilianAmount } from '../shared/occurrenceAmount.service'
import type { OccurrenceTotals as OccurrenceTotalsValue } from '../shared/occurrenceDraftValues.types'
import type { OccurrenceTotalOrigin } from '../shared/occurrenceTotalOrigin.service'
import styles from '../styles/occurrenceValues.module.css'

type OccurrenceTotalsProps = Readonly<{
  /** De onde vem o total do e-mail; `undefined` sem nada a somar. */
  origin: OccurrenceTotalOrigin | undefined
  totals: OccurrenceTotalsValue | undefined
}>

/**
 * Spec 247 (T5.3, T7.2): a soma dos produtos pela NF-e e o total que vai no e-mail — com a origem dele
 * dita, porque o digitado e o calculado se misturam linha a linha (RF9).
 */
export function OccurrenceTotals({ origin, totals }: OccurrenceTotalsProps) {
  const { t } = useTranslation('driverTrip')

  function formatMoney(cents: bigint | null | undefined): string {
    return t('occurrenceRegistration.items.money', {
      value: formatBrazilianAmount(cents ?? 0n),
    })
  }

  return (
    <div className={styles.totalsGroup}>
      <dl aria-live="polite" className={styles.totals}>
        <dt>{t('occurrenceRegistration.items.totals.sum')}</dt>
        <dd>{formatMoney(totals?.itemsSumCents)}</dd>
        <dt>{t('occurrenceRegistration.items.totals.inMail')}</dt>
        <dd>{formatMoney(totals?.declaredAmountCents)}</dd>
      </dl>
      {origin === undefined ? null : (
        <p className={styles.fieldHint}>
          {t(`occurrenceRegistration.items.totals.origin.${origin.kind}`, {
            total: origin.kind === 'mixed' ? origin.total : 0,
            typed: origin.kind === 'mixed' ? origin.typed : 0,
          })}
        </p>
      )}
    </div>
  )
}
