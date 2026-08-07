/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { MDFE_OWNER_TAX_REGIME, type FleetVehicleFormState } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetSelectField } from './FleetField.component'

type VehicleOwnerFieldsProps = Readonly<{
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleOwnerFields({ onChange, state }: VehicleOwnerFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleOwnerLegend')}</legend>
      <p className={styles.hint}>{t('vehicleOwnerHint')}</p>
      <div className={styles.fieldGrid}>
        <FleetField
          label={t('ownerName')}
          value={state.ownerName}
          onChange={(ownerName) => onChange({ ownerName })}
        />
        <FleetField
          inputMode="numeric"
          label={t('ownerTaxId')}
          maxLength={14}
          value={state.ownerTaxId}
          onChange={(ownerTaxId) => onChange({ ownerTaxId })}
        />
        <FleetField
          inputMode="numeric"
          label={t('ownerRntrc')}
          maxLength={9}
          value={state.ownerRntrc}
          onChange={(ownerRntrc) => onChange({ ownerRntrc })}
        />
        <FleetField
          label={t('ownerState')}
          maxLength={2}
          value={state.ownerState}
          onChange={(ownerState) => onChange({ ownerState })}
        />
        <FleetSelectField
          label={t('ownerTaxRegime')}
          optionLabelKey="ownerTaxRegimeOption"
          options={MDFE_OWNER_TAX_REGIME}
          value={state.ownerTaxRegime}
          onChange={(ownerTaxRegime) => onChange({ ownerTaxRegime })}
        />
      </div>
    </fieldset>
  )
}
