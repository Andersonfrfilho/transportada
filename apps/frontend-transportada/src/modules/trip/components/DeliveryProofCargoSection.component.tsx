/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { PanelModeField } from '../shared/deliveryProofPanelFields.constant'
import type {
  DeliveryProofFieldMode,
  DeliveryProofFieldSettings,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

import { DeliveryProofCargoMinimum } from './DeliveryProofCargoMinimum.component'
import { DeliveryProofModeSelect } from './DeliveryProofModeSelect.component'

type DeliveryProofCargoSectionProps = Readonly<{
  effective: DeliveryProofFieldSettings
  isDisabled: boolean
  onChangeCargoMinimum: (count: number) => void
  onChangeMode: (field: PanelModeField, mode: DeliveryProofFieldMode) => void
}>

export function DeliveryProofCargoSection({
  effective,
  isDisabled,
  onChangeCargoMinimum,
  onChangeMode,
}: DeliveryProofCargoSectionProps) {
  const { t } = useTranslation('trip')

  return (
    <section className={styles.panel} aria-label={t('deliveryProofSettings.fields.cargo')}>
      <DeliveryProofModeSelect
        field="cargo"
        isDisabled={isDisabled}
        onChange={onChangeMode}
        value={effective.cargo}
      />
      <p className={styles.hint}>{t('deliveryProofSettings.cargoHint')}</p>
      <DeliveryProofCargoMinimum
        isDisabled={isDisabled}
        mode={effective.cargo}
        onChange={onChangeCargoMinimum}
        value={effective.cargoMinimumCount}
      />
    </section>
  )
}
