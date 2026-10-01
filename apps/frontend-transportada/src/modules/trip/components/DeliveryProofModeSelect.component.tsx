/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import type { PanelModeField } from '../shared/deliveryProofPanelFields.constant'
import {
  DELIVERY_PROOF_FIELD_MODES,
  type DeliveryProofFieldMode,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

type DeliveryProofModeSelectProps = Readonly<{
  field: PanelModeField
  isDisabled: boolean
  onChange: (field: PanelModeField, mode: DeliveryProofFieldMode) => void
  value: DeliveryProofFieldMode
}>

export function DeliveryProofModeSelect({
  field,
  isDisabled,
  onChange,
  value,
}: DeliveryProofModeSelectProps) {
  const { t } = useTranslation('trip')

  const modeOptions = DELIVERY_PROOF_FIELD_MODES.map((mode) => ({
    label: t(`deliveryProofSettings.modes.${mode}`),
    value: mode,
  }))

  return (
    <label>
      <span className={styles.hint}>{t(`deliveryProofSettings.fields.${field}`)}</span>
      <Select
        ariaLabel={t(`deliveryProofSettings.fields.${field}`)}
        disabled={isDisabled}
        onChange={(selected) => onChange(field, selected as DeliveryProofFieldMode)}
        options={modeOptions}
        value={value}
      />
    </label>
  )
}
