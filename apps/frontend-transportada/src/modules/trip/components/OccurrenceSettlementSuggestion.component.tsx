/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { formatBrazilianAmount } from '../shared/occurrenceAmount.service'
import type { SettlementSuggestion } from '../shared/occurrenceSettlementSuggestion.service'
import styles from '../styles/trip.module.css'

export type OccurrenceSettlementSuggestionProps = Readonly<{
  onUse: () => void
  suggestion: SettlementSuggestion
}>

function formatReference(cents: bigint | null): null | string {
  return cents === null ? null : `R$ ${formatBrazilianAmount(cents)}`
}

/**
 * Spec 247 T5.4 (RF12, D11): o que o registro diz que cada item vale. É **sugestão** — nada é preenchido
 * sozinho, e o operador confirma ao salvar. A loja que não pagou não entra (a 164 não aceita valor zero) e
 * aparece à parte; a soma da linha segue visível como referência.
 */
export function OccurrenceSettlementSuggestion({
  onUse,
  suggestion,
}: OccurrenceSettlementSuggestionProps) {
  const { t } = useTranslation('trip')

  return (
    <section
      aria-label={t('occurrenceSettlement.suggestion.title')}
      className={styles.occurrenceStage}
    >
      <h5 className={styles.hint}>{t('occurrenceSettlement.suggestion.title')}</h5>
      <p className={styles.hint}>{t('occurrenceSettlement.suggestion.hint')}</p>
      <ul className={styles.occurrenceItemQuantityList}>
        {suggestion.rows.map((row) => (
          <li key={row.productCode}>
            <strong>{row.productCode}</strong>
            {` — R$ ${formatBrazilianAmount(row.amountCents)}`}
            {formatReference(row.referenceCents) === null
              ? null
              : ` · ${t('occurrenceSettlement.suggestion.reference', { amount: formatReference(row.referenceCents) })}`}
          </li>
        ))}
        {suggestion.unpaid.map((line) => (
          <li key={line.productCode}>
            <strong>{line.productCode}</strong>
            {` — ${t('occurrenceSettlement.suggestion.unpaid')}`}
            {formatReference(line.referenceCents) === null
              ? null
              : ` · ${t('occurrenceSettlement.suggestion.reference', { amount: formatReference(line.referenceCents) })}`}
          </li>
        ))}
      </ul>
      {suggestion.rows.length === 0 ? null : (
        <div className={styles.occurrenceFormActions}>
          <Button onClick={onUse} size="sm" type="button" variant="secondary">
            <Icon name="check" />
            {t('occurrenceSettlement.suggestion.use')}
          </Button>
        </div>
      )}
    </section>
  )
}
