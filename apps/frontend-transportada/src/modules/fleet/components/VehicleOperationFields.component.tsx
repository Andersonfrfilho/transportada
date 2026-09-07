/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'
import { LOADING_ACCESS_KINDS } from '@/modules/shared/loadingAccess.constant'

import { MDFE_BODY_TYPE, type FleetVehicleFormState } from '../shared/fleet.types'
import { VEHICLE_MEASURE_FIELD_SCALE } from '../shared/fleetVehicleMeasure.service'
import {
  deriveCapacityCubicMeters,
  hasCargoDimensions,
} from '../shared/vehicleCargoDimensions.service'
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
  /**
   * Spec 088 R1: medidas as três, o m³ é derivado e o campo digitado sai de cena — dois números que
   * discordam são a divergência que ninguém corrige, e o resolvedor já prefere a medida.
   */
  const isCapacityDerived = hasCargoDimensions(state)
  const derivedCapacity = deriveCapacityCubicMeters(state)

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
        {/*
          ⚠️ Campo próprio, e **não** deduzido do tipo nem da carroceria: a mesma Sprinter existe
          com e sem porta lateral. O `bodyType` semeia o valor na migration e para por aí.
        */}
        <FleetSelectField
          label={t('loadingAccess')}
          optionLabelKey="loadingAccessOption"
          options={LOADING_ACCESS_KINDS}
          value={state.loadingAccess}
          onChange={(loadingAccess) => onChange({ loadingAccess })}
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
          optional
          label={t('cargoLengthMeters')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.cargoLengthMeters.form}
          value={state.cargoLengthMeters}
          onChange={(cargoLengthMeters) => onChange({ cargoLengthMeters })}
        />
        <FleetMeasureField
          optional
          label={t('cargoWidthMeters')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.cargoWidthMeters.form}
          value={state.cargoWidthMeters}
          onChange={(cargoWidthMeters) => onChange({ cargoWidthMeters })}
        />
        <FleetMeasureField
          optional
          label={t('cargoHeightMeters')}
          scale={VEHICLE_MEASURE_FIELD_SCALE.cargoHeightMeters.form}
          value={state.cargoHeightMeters}
          onChange={(cargoHeightMeters) => onChange({ cargoHeightMeters })}
        />
        <FleetMeasureField
          {...(isCapacityDerived ? { hint: t('capacityCubicMetersDerivedHint') } : {})}
          label={t('capacityCubicMeters')}
          readOnly={isCapacityDerived}
          scale={VEHICLE_MEASURE_FIELD_SCALE.capacityCubicMeters.form}
          value={isCapacityDerived ? derivedCapacity : state.capacityCubicMeters}
          onChange={(capacityCubicMeters) => onChange({ capacityCubicMeters })}
        />
      </div>
    </fieldset>
  )
}
