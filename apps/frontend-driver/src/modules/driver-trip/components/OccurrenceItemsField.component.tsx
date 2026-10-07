/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { OccurrenceValuesForm } from '../hooks/useOccurrenceValues.hook'
import styles from '../styles/occurrenceValues.module.css'
import { OccurrenceItemRow } from './OccurrenceItemRow.component'
import { OccurrenceTotals } from './OccurrenceTotals.component'

type OccurrenceItemsFieldProps = Readonly<{
  /** `undefined` quando o tipo desliga o valor pago. */
  declaredAmountLabel: string | undefined
  form: OccurrenceValuesForm
  isRequired: boolean
}>

/**
 * Spec 247 (T5.3, RF11, CA07): a lista de produtos da nota com quantidade por item, a soma da linha e a
 * soma geral. O mesmo bloco serve ao tipo com produtos obrigatórios e ao opcional; sem nenhum marcado, o
 * registro vale para a nota inteira (a regra do servidor).
 */
export function OccurrenceItemsField({
  declaredAmountLabel,
  form,
  isRequired,
}: OccurrenceItemsFieldProps) {
  const { t } = useTranslation('driverTrip')
  const titleId = useId()
  const { amountTarget, lines, totals } = form.values
  const isAmountVisible = declaredAmountLabel !== undefined && amountTarget === 'item'

  return (
    <div className={styles.block}>
      <p className={styles.blockTitle} id={titleId}>
        {t(
          isRequired
            ? 'occurrenceRegistration.items.titleRequired'
            : 'occurrenceRegistration.items.titleOptional',
        )}
      </p>
      <ul aria-labelledby={titleId} className={styles.items}>
        {lines.map((line) => (
          <OccurrenceItemRow
            declaredAmountLabel={declaredAmountLabel ?? ''}
            form={form}
            isAmountVisible={isAmountVisible}
            key={line.product.code}
            line={line}
          />
        ))}
      </ul>
      <OccurrenceTotals declaredAmountLabel={declaredAmountLabel} totals={totals} />
    </div>
  )
}
