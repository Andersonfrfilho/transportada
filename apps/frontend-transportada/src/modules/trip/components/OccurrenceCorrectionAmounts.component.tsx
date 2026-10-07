/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import {
  CORRECTION_AMOUNT_SCOPE,
  isValidReferenceNumber,
  type CorrectionAmountScope,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import { maskAmountInput } from '../shared/occurrenceSettlementMoney.service'
import { readCorrectionLineSums } from '../shared/occurrenceCorrectionSums.service'
import type { OccurrenceQuantitiesByCode } from '../shared/occurrenceProductSelection.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'

export type OccurrenceCorrectionAmountsProps = Readonly<{
  codes: readonly string[]
  draft: CorrectionAmountsDraft
  onChange: (draft: CorrectionAmountsDraft) => void
  products: readonly TripDocumentProduct[]
  quantitiesByCode: OccurrenceQuantitiesByCode
}>

/**
 * Spec 247 T5.4 (RF13): o número do documento do cliente e o valor pago — por linha ou um só pela ocorrência.
 * Campo que o operador não tocou é "mantenha o gravado"; apagar o que digitou limpa. A soma da linha é só
 * referência (nota × quantidade, em inteiro): o valor pago digitado vale no lugar dela.
 */
export function OccurrenceCorrectionAmounts({
  codes,
  draft,
  onChange,
  products,
  quantitiesByCode,
}: OccurrenceCorrectionAmountsProps) {
  const { t } = useTranslation('trip')
  const alertId = useId()
  const sums = readCorrectionLineSums({ codes, products, quantitiesByCode })
  const isByLine = draft.scope === CORRECTION_AMOUNT_SCOPE.item && codes.length > 0
  const referenceText = draft.referenceNumber?.trim() ?? ''
  const isReferenceInvalid = referenceText !== '' && !isValidReferenceNumber(referenceText)
  const referenceLabel = t('occurrenceDetail.correction.amounts.referenceLabel')
  const amountLabel = t('occurrenceDetail.correction.amounts.amountLabel')

  function handleLineAmountChange(code: string, text: string) {
    onChange({ ...draft, lineAmounts: new Map(draft.lineAmounts).set(code, maskAmountInput(text)) })
  }

  return (
    <section aria-label={t('occurrenceDetail.correction.amounts.title')} className={styles.amounts}>
      <p className={styles.title}>{t('occurrenceDetail.correction.amounts.title')}</p>
      <p className={styles.sum}>{t('occurrenceDetail.correction.amounts.hint')}</p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{referenceLabel}</span>
        <input
          aria-describedby={isReferenceInvalid ? alertId : undefined}
          aria-invalid={isReferenceInvalid}
          aria-label={referenceLabel}
          className={isReferenceInvalid ? styles.invalid : undefined}
          maxLength={60}
          onChange={(event) => onChange({ ...draft, referenceNumber: event.target.value })}
          type="text"
          value={draft.referenceNumber ?? ''}
        />
      </label>
      {isReferenceInvalid ? (
        <p className={styles.alert} id={alertId} role="alert">
          {t('occurrenceDetail.correction.amounts.referenceInvalid')}
        </p>
      ) : null}
      {codes.length > 0 ? (
        <div className={styles.field}>
          <span aria-hidden="true" className={styles.fieldLabel}>
            {t('occurrenceDetail.correction.amounts.scopeTitle')}
          </span>
          <Select
            ariaLabel={t('occurrenceDetail.correction.amounts.scope')}
            onChange={(scope) => onChange({ ...draft, scope: scope as CorrectionAmountScope })}
            options={Object.values(CORRECTION_AMOUNT_SCOPE).map((scope) => ({
              label: t(`occurrenceDetail.correction.amounts.scopes.${scope}`),
              value: scope,
            }))}
            value={draft.scope}
          />
        </div>
      ) : null}
      {isByLine ? (
        <div className={styles.lines}>
          {codes.map((code) => (
            <label className={styles.field} key={code}>
              <span className={styles.fieldLabel}>{`${code} — ${amountLabel}`}</span>
              <input
                aria-label={`${code} — ${amountLabel}`}
                inputMode="decimal"
                onChange={(event) => handleLineAmountChange(code, event.target.value)}
                placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
                type="text"
                value={draft.lineAmounts.get(code) ?? ''}
              />
              {sums.lines.get(code) === undefined ? null : (
                <span className={styles.sum}>
                  {t('occurrenceDetail.correction.amounts.lineSum', {
                    amount: sums.lines.get(code),
                  })}
                </span>
              )}
            </label>
          ))}
        </div>
      ) : (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('occurrenceDetail.correction.amounts.occurrenceAmount')}
          </span>
          <input
            aria-label={t('occurrenceDetail.correction.amounts.occurrenceAmount')}
            inputMode="decimal"
            onChange={(event) =>
              onChange({ ...draft, occurrenceAmount: maskAmountInput(event.target.value) })
            }
            placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
            type="text"
            value={draft.occurrenceAmount ?? ''}
          />
        </label>
      )}
      {sums.total === null ? null : (
        <p className={styles.total}>
          {t('occurrenceDetail.correction.amounts.totalSum', { amount: sums.total })}
        </p>
      )}
    </section>
  )
}
