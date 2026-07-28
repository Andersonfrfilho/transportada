/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  FLEET_VEHICLE_OWNERSHIP,
  FLEET_VEHICLE_ROLE,
  MDFE_BODY_TYPE,
  MDFE_WHEEL_TYPE,
  type FleetVehicleFormState,
} from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetSelectField } from './FleetField.component'

type VehicleIdentityFieldsProps = Readonly<{
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleIdentityFields({ onChange, state }: VehicleIdentityFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleIdentityLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetField
          label={t('plate')}
          maxLength={8}
          value={state.plate}
          onChange={(plate) => onChange({ plate })}
        />
        <FleetField
          inputMode="numeric"
          label={t('renavam')}
          maxLength={11}
          value={state.renavam}
          onChange={(renavam) => onChange({ renavam })}
        />
        <FleetField
          label={t('vehicleState')}
          maxLength={2}
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
        <FleetSelectField
          label={t('ownership')}
          optionLabelKey="ownershipOption"
          options={FLEET_VEHICLE_OWNERSHIP}
          value={state.ownership}
          onChange={(ownership) => onChange({ ownership })}
        />
      </div>
    </fieldset>
  )
}
