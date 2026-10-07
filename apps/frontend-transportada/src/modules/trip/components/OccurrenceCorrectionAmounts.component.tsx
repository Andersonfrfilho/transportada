/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import type { DeclaredAmountScope } from '../shared/occurrence.constant'
import {
  CORRECTION_AMOUNT_SCOPE,
  isCorrectionAmountByLine,
  isValidReferenceNumber,
  resolveCorrectionAmountScope,
  resolveCorrectionAmounts,
  type CorrectionAmountScope,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import { readCorrectionLineSums } from '../shared/occurrenceCorrectionSums.service'
import type { OccurrenceQuantitiesByCode } from '../shared/occurrenceProductSelection.service'
import {
  maskRecordedAmount,
  resolveCorrectionFinalAmounts,
  type CorrectionRecordedAmounts,
} from '../shared/occurrenceRecordedAmounts.service'
import { maskAmountInput } from '../shared/occurrenceSettlementMoney.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { OccurrenceRecordedField } from './OccurrenceRecordedField.component'

export type OccurrenceCorrectionAmountsProps = Readonly<{
  draft: CorrectionAmountsDraft
  onChange: (draft: CorrectionAmountsDraft) => void
  recorded: CorrectionRecordedAmounts
  selection: Readonly<{
    codes: readonly string[]
    products: readonly TripDocumentProduct[]
    quantitiesByCode: OccurrenceQuantitiesByCode
  }>
  /** Os rótulos e o nível que o **tipo** da ocorrência escolheu; ausente é o genérico. */
  typeConfig: Readonly<{
    amountLabel: string | undefined
    referenceLabel: string | undefined
    scope: DeclaredAmountScope | undefined
  }>
}>

/**
 * Spec 247 T5.4 (RF13) + T7.2 (A1/A2): o número do documento do cliente e o valor pago, por linha ou um só pela
 * ocorrência. Nasce com o que está gravado e no nível em que está gravado; trocar de nível limpa o outro
 * explicitamente (o servidor recusa os dois juntos). A soma da linha e a soma geral são só a conta da nota: o
 * "valor que vai no e-mail" é o que o servidor imprime, e digitar o valor pago não muda a soma.
 */
export function OccurrenceCorrectionAmounts({
  draft,
  onChange,
  recorded,
  selection,
  typeConfig,
}: OccurrenceCorrectionAmountsProps) {
  const { t } = useTranslation('trip')
  const alertId = useId()
  const { codes } = selection
  const context = { codes, draft, recorded, typeScope: typeConfig.scope }
  const scope = resolveCorrectionAmountScope(context)
  const isByLine = isCorrectionAmountByLine(context)
  const final = resolveCorrectionFinalAmounts({
    codes,
    recorded,
    resolution: resolveCorrectionAmounts(context),
  })
  const sums = readCorrectionLineSums({ ...selection, final })
  const referenceText = draft.referenceNumber ?? recorded.referenceNumber ?? ''
  const trimmedReference = referenceText.trim()
  const isReferenceInvalid = trimmedReference !== '' && !isValidReferenceNumber(trimmedReference)
  const referenceLabel =
    typeConfig.referenceLabel ?? t('occurrenceDetail.correction.amounts.referenceLabel')
  const amountLabel = typeConfig.amountLabel ?? t('occurrenceDetail.correction.amounts.amountLabel')
  const otherLevelNotice = readOtherLevelNotice({ isByLine, recorded })

  function handleLineAmountChange(code: string, text: string) {
    onChange({ ...draft, lineAmounts: new Map(draft.lineAmounts).set(code, maskAmountInput(text)) })
  }

  return (
    <section aria-label={t('occurrenceDetail.correction.amounts.title')} className={styles.amounts}>
      <p className={styles.title}>{t('occurrenceDetail.correction.amounts.title')}</p>
      <p className={styles.sum}>{t('occurrenceDetail.correction.amounts.hint')}</p>
      <OccurrenceRecordedField
        hasRecorded={recorded.referenceNumber !== null}
        inputMode="text"
        isInvalid={isReferenceInvalid}
        label={referenceLabel}
        maxLength={60}
        onChange={(text) => onChange({ ...draft, referenceNumber: text })}
        value={referenceText}
      />
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
            onChange={(next) => onChange({ ...draft, scope: next as CorrectionAmountScope })}
            options={Object.values(CORRECTION_AMOUNT_SCOPE).map((option) => ({
              label: t(`occurrenceDetail.correction.amounts.scopes.${option}`),
              value: option,
            }))}
            value={scope}
          />
        </div>
      ) : null}
      {otherLevelNotice === null ? null : <p className={styles.notice}>{t(otherLevelNotice)}</p>}
      {isByLine ? (
        <div className={styles.lines}>
          {codes.map((code) => (
            <OccurrenceRecordedField
              hasRecorded={recorded.lineAmounts.has(code)}
              inputMode="decimal"
              isInvalid={false}
              key={code}
              label={`${code} — ${amountLabel}`}
              onChange={(text) => handleLineAmountChange(code, text)}
              placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
              value={
                draft.lineAmounts.get(code) ?? maskRecordedAmount(recorded.lineAmounts.get(code))
              }
            >
              {sums.lines.get(code) === undefined ? null : (
                <span className={styles.sum}>
                  {t('occurrenceDetail.correction.amounts.lineSum', {
                    amount: sums.lines.get(code),
                  })}
                </span>
              )}
            </OccurrenceRecordedField>
          ))}
        </div>
      ) : (
        <OccurrenceRecordedField
          hasRecorded={recorded.declaredAmount !== null}
          inputMode="decimal"
          isInvalid={false}
          label={
            typeConfig.amountLabel === undefined
              ? t('occurrenceDetail.correction.amounts.occurrenceAmount')
              : t('occurrenceDetail.correction.amounts.occurrenceAmountTyped', {
                  label: typeConfig.amountLabel,
                })
          }
          onChange={(text) => onChange({ ...draft, occurrenceAmount: maskAmountInput(text) })}
          placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
          value={draft.occurrenceAmount ?? maskRecordedAmount(recorded.declaredAmount)}
        />
      )}
      {sums.total === null ? null : (
        <p className={styles.total}>
          {t('occurrenceDetail.correction.amounts.totalSum', { amount: sums.total })}
        </p>
      )}
      {sums.emailAmount === null ? null : (
        <p className={styles.total}>
          {t('occurrenceDetail.correction.amounts.emailAmount', { amount: sums.emailAmount })}
        </p>
      )}
    </section>
  )
}

/** O valor gravado no nível que **não** está em uso: avisa que digitar aqui o apaga (só um nível vale por vez). */
function readOtherLevelNotice(
  input: Readonly<{ isByLine: boolean; recorded: CorrectionRecordedAmounts }>,
): null | string {
  const { isByLine, recorded } = input
  if (isByLine && recorded.declaredAmount !== null) {
    return 'occurrenceDetail.correction.amounts.noticeOccurrenceRecorded'
  }
  if (!isByLine && recorded.lineAmounts.size > 0) {
    return 'occurrenceDetail.correction.amounts.noticeLinesRecorded'
  }
  return null
}
