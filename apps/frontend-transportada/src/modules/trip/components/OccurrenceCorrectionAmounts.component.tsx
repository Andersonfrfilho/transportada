/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { OCCURRENCE_ATTACHMENT_MODE } from '../shared/occurrence.constant'
import {
  isCorrectionAmountByLine,
  resolveCorrectionAmountScope,
  resolveCorrectionAmounts,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import { readCorrectionLineSums } from '../shared/occurrenceCorrectionSums.service'
import type { OccurrenceTypeRecordConfig } from '../shared/occurrenceRecordConfig.service'
import type { OccurrenceQuantitiesByCode } from '../shared/occurrenceProductSelection.service'
import {
  resolveCorrectionFinalAmounts,
  type CorrectionRecordedAmounts,
} from '../shared/occurrenceRecordedAmounts.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import type { TripOccurrenceItemValue } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { OccurrenceCorrectionAmountInputs } from './OccurrenceCorrectionAmountInputs.component'
import { OccurrenceCorrectionReference } from './OccurrenceCorrectionReference.component'

export type OccurrenceCorrectionAmountsProps = Readonly<{
  draft: CorrectionAmountsDraft
  onChange: (draft: CorrectionAmountsDraft) => void
  recorded: CorrectionRecordedAmounts
  selection: Readonly<{
    codes: readonly string[]
    /** O valor unitário que o registro copiou; ausente é API anterior. */
    itemValues?: readonly TripOccurrenceItemValue[] | undefined
    products: readonly TripDocumentProduct[]
    quantitiesByCode: OccurrenceQuantitiesByCode
  }>
  /** Os modos, rótulos e o nível que o **tipo** da ocorrência escolheu; ausente é o genérico. */
  typeConfig: OccurrenceTypeRecordConfig
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
  const { codes } = selection
  const context = {
    amountMode: typeConfig.amountMode,
    codes,
    draft,
    recorded,
    referenceMode: typeConfig.referenceMode,
    typeScope: typeConfig.scope,
  }
  const isReferenceOff = typeConfig.referenceMode === OCCURRENCE_ATTACHMENT_MODE.off
  const isAmountOff = typeConfig.amountMode === OCCURRENCE_ATTACHMENT_MODE.off
  const scope = resolveCorrectionAmountScope(context)
  const isByLine = isCorrectionAmountByLine(context)
  const final = resolveCorrectionFinalAmounts({
    codes,
    recorded,
    resolution: resolveCorrectionAmounts(context),
  })
  const sums = readCorrectionLineSums({ ...selection, final })

  return (
    <section aria-label={t('occurrenceDetail.correction.amounts.title')} className={styles.amounts}>
      <p className={styles.title}>{t('occurrenceDetail.correction.amounts.title')}</p>
      <p className={styles.sum}>{t('occurrenceDetail.correction.amounts.hint')}</p>
      {isReferenceOff ? null : (
        <OccurrenceCorrectionReference
          draft={draft}
          isRequired={typeConfig.referenceMode === OCCURRENCE_ATTACHMENT_MODE.required}
          label={typeConfig.referenceLabel}
          onChange={onChange}
          recorded={recorded}
        />
      )}
      {isAmountOff ? null : (
        <OccurrenceCorrectionAmountInputs
          amountLabel={typeConfig.amountLabel}
          codes={codes}
          draft={draft}
          isByLine={isByLine}
          isRequired={typeConfig.amountMode === OCCURRENCE_ATTACHMENT_MODE.required}
          lineSums={sums.lines}
          onChange={onChange}
          recorded={recorded}
          scope={scope}
        />
      )}
      {isAmountOff || sums.total === null ? null : (
        <p className={styles.total}>
          {t('occurrenceDetail.correction.amounts.totalSum', { amount: sums.total })}
        </p>
      )}
      {isAmountOff || sums.emailAmount === null ? null : (
        <p className={styles.total}>
          {t('occurrenceDetail.correction.amounts.emailAmount', { amount: sums.emailAmount })}
        </p>
      )}
    </section>
  )
}
