/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { MDFE_BODY_TYPE, type FleetVehicleFormState } from '../shared/fleet.types'
import { VEHICLE_MEASURE_FIELD_SCALE } from '../shared/fleetVehicleMeasure.service'
import styles from '../styles/fleet.module.css'
import { FleetMeasureField, FleetSelectField } from './FleetField.component'

type VehicleOperationFieldsProps = Readonly<{
  documentFields: ReadonlySet<string>
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleOperationFields({
  documentFields,
  onChange,
  state,
}: VehicleOperationFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleOperationLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetSelectField
          fromDocument={documentFields.has('bodyType')}
          label={t('bodyType')}
          optionLabelKey="bodyTypeOption"
          options={MDFE_BODY_TYPE}
          value={state.bodyType}
          onChange={(bodyType) => onChange({ bodyType })}
        />
        <FleetMeasureField
          label={t('tareWeightKilograms')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.tareWeightKilograms.form}
          value={state.tareWeightKilograms}
          onChange={(tareWeightKilograms) => onChange({ tareWeightKilograms })}
        />
        <FleetMeasureField
          label={t('capacityKilograms')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.capacityKilograms.form}
          value={state.capacityKilograms}
          onChange={(capacityKilograms) => onChange({ capacityKilograms })}
        />
        <FleetMeasureField
          label={t('capacityCubicMeters')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.capacityCubicMeters.form}
          value={state.capacityCubicMeters}
          onChange={(capacityCubicMeters) => onChange({ capacityCubicMeters })}
        />
      </div>
    </fieldset>
  )
}
