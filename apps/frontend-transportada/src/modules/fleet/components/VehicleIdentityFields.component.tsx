/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { VEHICLE_TYPES } from '@/modules/shared/vehicleType.constant'

import { BRAZIL_STATE, FLEET_VEHICLE_ROLE, type FleetVehicleFormState } from '../shared/fleet.types'
import { toPlateInput } from '../shared/fleetPlate.service'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetSelectField } from './FleetField.component'
import { PlateThumbnail } from './PlateThumbnail.component'

type VehicleIdentityFieldsProps = Readonly<{
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleIdentityFields({ onChange, state }: VehicleIdentityFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleIdentityLegend')}</legend>
      <div className={styles.plateRow}>
        <FleetField
          label={t('plate')}
          maxLength={8}
          value={state.plate}
          onChange={(plate) => onChange({ plate: toPlateInput(plate) })}
        />
        <PlateThumbnail plate={state.plate} state={state.state} />
      </div>
      <div className={styles.fieldGrid}>
        <FleetField
          inputMode="numeric"
          label={t('renavam')}
          maxLength={11}
          value={state.renavam}
          onChange={(renavam) => onChange({ renavam })}
        />
        <FleetSelectField
          label={t('vehicleState')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('vehicleStateUnset')}
          value={state.state}
          onChange={(vehicleState) => onChange({ state: vehicleState })}
        />
        <FleetSelectField
          label={t('role')}
          optionLabelKey="roleOption"
          options={FLEET_VEHICLE_ROLE}
          value={state.role}
          onChange={(role) => onChange({ role })}
        />
        {state.role === 'traction' ? (
          <FleetSelectField
            clearable
            label={t('vehicleType')}
            optionLabelKey="vehicleTypeOption"
            options={VEHICLE_TYPES}
            placeholder={t('vehicleTypeUnset')}
            value={state.vehicleType}
            onChange={(vehicleType) => onChange({ vehicleType })}
          />
        ) : null}
      </div>
      {state.role === 'traction' ? (
        <p className={styles.hint}>
          {state.vehicleType === '' ? t('vehicleTypeRequiredHint') : t('vehicleTypeHint')}
        </p>
      ) : null}
    </fieldset>
  )
}
