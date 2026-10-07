/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { DeclaredAmountScope } from '../shared/occurrence.constant'
import {
  isCorrectionAmountByLine,
  isValidReferenceNumber,
  resolveCorrectionAmountScope,
  resolveCorrectionAmounts,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import { readCorrectionLineSums } from '../shared/occurrenceCorrectionSums.service'
import type { OccurrenceQuantitiesByCode } from '../shared/occurrenceProductSelection.service'
import {
  resolveCorrectionFinalAmounts,
  type CorrectionRecordedAmounts,
} from '../shared/occurrenceRecordedAmounts.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { OccurrenceCorrectionAmountInputs } from './OccurrenceCorrectionAmountInputs.component'
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
      <OccurrenceCorrectionAmountInputs
        amountLabel={typeConfig.amountLabel}
        codes={codes}
        draft={draft}
        isByLine={isByLine}
        lineSums={sums.lines}
        onChange={onChange}
        recorded={recorded}
        scope={scope}
      />
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
