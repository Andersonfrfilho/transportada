/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { AmountLimitNotice } from './AmountLimitNotice.component'

export type OccurrenceRecordedFieldProps = Readonly<{
  children?: ReactNode
  /** O campo tinha valor gravado: apagado, vai limpar; sem gravado, não há o que limpar. */
  hasRecorded: boolean
  inputMode: 'decimal' | 'text'
  isInvalid: boolean
  /** Spec 247 T7.2b: o tipo exige o campo — não há "Limpar" e o texto diz que é obrigatório. */
  isRequired?: boolean
  label: string
  maxLength?: number
  onChange: (text: string) => void
  placeholder?: string
  value: string
}>

/**
 * Spec 247 T7.2 (A2): um campo da correção que nasce com o gravado. Limpar é um botão explícito (envia `null`),
 * e o campo vazio diz o que acontece: "nada gravado" ou "será limpo ao salvar" — apagar a mão não é gesto escondido.
 */
export function OccurrenceRecordedField({
  children,
  hasRecorded,
  inputMode,
  isInvalid,
  isRequired = false,
  label,
  maxLength,
  onChange,
  placeholder,
  value,
}: OccurrenceRecordedFieldProps) {
  const { t } = useTranslation('trip')
  const stateId = useId()
  const isEmpty = value.trim() === ''
  const stateText = isRequired
    ? t('occurrenceDetail.correction.amounts.required')
    : isEmpty
      ? t(
          hasRecorded
            ? 'occurrenceDetail.correction.amounts.willClear'
            : 'occurrenceDetail.correction.amounts.nothingRecorded',
        )
      : null

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`${stateId}-input`}>
        {label}
      </label>
      <div className={styles.inputRow}>
        <input
          aria-describedby={stateText === null ? undefined : stateId}
          aria-invalid={isInvalid}
          aria-label={label}
          className={isInvalid ? styles.invalid : undefined}
          id={`${stateId}-input`}
          inputMode={inputMode}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
        {isEmpty || isRequired ? null : (
          <Button
            aria-label={`${t('occurrenceDetail.correction.amounts.clear')}: ${label}`}
            className={styles.clear}
            onClick={() => onChange('')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('occurrenceDetail.correction.amounts.clear')}
          </Button>
        )}
      </div>
      {inputMode === 'decimal' ? <AmountLimitNotice value={value} /> : null}
      {stateText === null ? null : (
        <span className={styles.sum} id={stateId}>
          {stateText}
        </span>
      )}
      {children}
    </div>
  )
}
