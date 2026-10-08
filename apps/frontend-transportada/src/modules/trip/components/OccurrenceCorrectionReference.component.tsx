/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  isValidReferenceNumber,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import type { CorrectionRecordedAmounts } from '../shared/occurrenceRecordedAmounts.service'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { OccurrenceRecordedField } from './OccurrenceRecordedField.component'

export type OccurrenceCorrectionReferenceProps = Readonly<{
  draft: CorrectionAmountsDraft
  isRequired: boolean
  /** O rótulo que o tipo escolheu; ausente é o genérico. */
  label: string | undefined
  onChange: (draft: CorrectionAmountsDraft) => void
  recorded: CorrectionRecordedAmounts
}>

/** O número do documento do cliente: nasce com o gravado e o padrão da API é conferido na hora. */
export function OccurrenceCorrectionReference({
  draft,
  isRequired,
  label,
  onChange,
  recorded,
}: OccurrenceCorrectionReferenceProps) {
  const { t } = useTranslation('trip')
  const alertId = useId()
  const text = draft.referenceNumber ?? recorded.referenceNumber ?? ''
  const trimmed = text.trim()
  const isInvalid = trimmed !== '' && !isValidReferenceNumber(trimmed)

  return (
    <>
      <OccurrenceRecordedField
        hasRecorded={recorded.referenceNumber !== null}
        inputMode="text"
        isInvalid={isInvalid}
        isRequired={isRequired}
        label={label ?? t('occurrenceDetail.correction.amounts.referenceLabel')}
        maxLength={60}
        onChange={(next) => onChange({ ...draft, referenceNumber: next })}
        value={text}
      />
      {isInvalid ? (
        <p className={styles.alert} id={alertId} role="alert">
          {t('occurrenceDetail.correction.amounts.referenceInvalid')}
        </p>
      ) : null}
    </>
  )
}
