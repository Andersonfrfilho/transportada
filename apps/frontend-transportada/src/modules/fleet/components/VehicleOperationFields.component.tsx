/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  FLEET_VEHICLE_ROLE,
  MDFE_BODY_TYPE,
  MDFE_WHEEL_TYPE,
  type FleetVehicleFormState,
} from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetSelectField } from './FleetField.component'

type VehicleOperationFieldsProps = Readonly<{
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleOperationFields({ onChange, state }: VehicleOperationFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleOperationLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetSelectField
          label={t('role')}
          optionLabelKey="roleOption"
          options={FLEET_VEHICLE_ROLE}
          value={state.role}
          onChange={(role) => onChange({ role })}
        />
        {state.role === 'traction' ? (
          <FleetSelectField
            label={t('wheelType')}
            optionLabelKey="wheelTypeOption"
            options={MDFE_WHEEL_TYPE}
            value={state.wheelType}
            onChange={(wheelType) => onChange({ wheelType })}
          />
        ) : null}
        <FleetSelectField
          label={t('bodyType')}
          optionLabelKey="bodyTypeOption"
          options={MDFE_BODY_TYPE}
          value={state.bodyType}
          onChange={(bodyType) => onChange({ bodyType })}
        />
        <FleetField
          inputMode="numeric"
          label={t('tareWeightKilograms')}
          maxLength={9}
          value={state.tareWeightKilograms}
          onChange={(tareWeightKilograms) => onChange({ tareWeightKilograms })}
        />
        <FleetField
          inputMode="numeric"
          label={t('capacityKilograms')}
          maxLength={9}
          value={state.capacityKilograms}
          onChange={(capacityKilograms) => onChange({ capacityKilograms })}
        />
        <FleetField
          inputMode="numeric"
          label={t('capacityCubicMeters')}
          maxLength={6}
          value={state.capacityCubicMeters}
          onChange={(capacityCubicMeters) => onChange({ capacityCubicMeters })}
        />
      </div>
    </fieldset>
  )
}
