/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatBrazilianAmount } from '../shared/occurrenceAmount.service'
import type { OccurrenceTotals as OccurrenceTotalsValue } from '../shared/occurrenceDraftValues.service'
import styles from '../styles/occurrenceValues.module.css'

type OccurrenceTotalsProps = Readonly<{
  /** O rótulo do valor pago do tipo; `undefined` quando o tipo o desliga ("Valor no e-mail"). */
  declaredAmountLabel: string | undefined
  totals: OccurrenceTotalsValue | undefined
}>

/** Spec 247 (T5.3): a soma dos produtos pela NF-e e o valor pago — o que o servidor vai recalcular igual. */
export function OccurrenceTotals({ declaredAmountLabel, totals }: OccurrenceTotalsProps) {
  const { t } = useTranslation('driverTrip')

  function formatMoney(cents: bigint | null | undefined): string {
    return t('occurrenceRegistration.items.money', {
      value: formatBrazilianAmount(cents ?? 0n),
    })
  }

  return (
    <dl aria-live="polite" className={styles.totals}>
      <dt>{t('occurrenceRegistration.items.totals.sum')}</dt>
      <dd>{formatMoney(totals?.itemsSumCents)}</dd>
      <dt>{declaredAmountLabel ?? t('occurrenceRegistration.items.totals.inMail')}</dt>
      <dd>{formatMoney(totals?.declaredAmountCents)}</dd>
    </dl>
  )
}
