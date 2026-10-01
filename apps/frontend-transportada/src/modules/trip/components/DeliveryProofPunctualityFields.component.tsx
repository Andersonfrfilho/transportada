/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DELIVERY_PROOF_PUNCTUALITY_FIELDS,
  DELIVERY_PROOF_PUNCTUALITY_RANGES,
  isDeliveryProofPunctualityValue,
  type DeliveryProofPunctualityField,
  type DeliveryProofPunctualitySettings,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

type DeliveryProofPunctualityFieldsProps = Readonly<{
  draft: Partial<Record<DeliveryProofPunctualityField, string>>
  general: DeliveryProofPunctualitySettings
  isDisabled: boolean
  onChange: (field: DeliveryProofPunctualityField, raw: string) => void
  resolveValue: (field: DeliveryProofPunctualityField) => number
}>

export function DeliveryProofPunctualityFields({
  draft,
  general,
  isDisabled,
  onChange,
  resolveValue,
}: DeliveryProofPunctualityFieldsProps) {
  const { t } = useTranslation('trip')
  /** O erro de faixa é anunciado junto do campo pelo leitor de tela (`aria-describedby`). */
  const punctualityErrorIdPrefix = useId()

  return (
    <div className={styles.fieldGrid}>
      {DELIVERY_PROOF_PUNCTUALITY_FIELDS.map((field) => {
        const range = DELIVERY_PROOF_PUNCTUALITY_RANGES[field]
        const value = draft[field] ?? String(general[field])
        const isInvalid = !isDeliveryProofPunctualityValue(field, resolveValue(field))
        const errorId = `${punctualityErrorIdPrefix}-${field}`
        return (
          <label key={field}>
            <span className={styles.hint}>{t(`deliveryProofSettings.punctuality.${field}`)}</span>
            <input
              {...(isInvalid ? { 'aria-describedby': errorId } : {})}
              aria-invalid={isInvalid}
              disabled={isDisabled}
              max={range.max}
              min={range.min}
              type="number"
              value={value}
              onChange={(event) => onChange(field, event.target.value)}
            />
            {isInvalid ? (
              <span className={styles.alert} id={errorId} role="alert">
                {t('deliveryProofSettings.punctuality.rangeError', {
                  max: range.max,
                  min: range.min,
                })}
              </span>
            ) : null}
          </label>
        )
      })}
    </div>
  )
}
