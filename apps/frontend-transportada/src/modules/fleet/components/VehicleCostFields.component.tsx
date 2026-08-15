/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { FUEL_PRODUCTS } from '@/modules/shared/fuel.constant'

import type { FleetVehicleFormState, FleetVehicleFuelPrice } from '../shared/fleet.types'
import {
  formatCostReferenceDate,
  formatFuelPricePerUnit,
  resolveFuelLabelKeys,
  summarizeTypedVehicleCosts,
} from '../shared/fleetVehicleCost.service'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetSelectField } from './FleetField.component'

type VehicleCostFieldsProps = Readonly<{
  costsUpdatedAt: null | string
  fuelPrice: FleetVehicleFuelPrice | null
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleCostFields({
  costsUpdatedAt,
  fuelPrice,
  onChange,
  state,
}: VehicleCostFieldsProps) {
  const { i18n, t } = useTranslation('fleet')
  const fuelLabels = resolveFuelLabelKeys(state.fuelType)
  const summary = summarizeTypedVehicleCosts({
    fields: state,
    fuelPricePerUnit: fuelPrice?.pricePerUnit ?? null,
  })

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleCostLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetField
          optional
          inputMode="numeric"
          label={t('acquisitionAmount')}
          maxLength={16}
          value={state.acquisitionAmount}
          onChange={(acquisitionAmount) => onChange({ acquisitionAmount })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t('monthlyInstallmentAmount')}
          maxLength={16}
          value={state.monthlyInstallmentAmount}
          onChange={(monthlyInstallmentAmount) => onChange({ monthlyInstallmentAmount })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t('annualVehicleTaxAmount')}
          maxLength={16}
          value={state.annualVehicleTaxAmount}
          onChange={(annualVehicleTaxAmount) => onChange({ annualVehicleTaxAmount })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t('annualInsuranceAmount')}
          maxLength={16}
          value={state.annualInsuranceAmount}
          onChange={(annualInsuranceAmount) => onChange({ annualInsuranceAmount })}
        />
        <FleetSelectField
          label={t('fuelType')}
          optionLabelKey="fuelOption"
          options={FUEL_PRODUCTS}
          value={state.fuelType}
          onChange={(fuelType) => onChange({ fuelType })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t(fuelLabels.averageConsumption)}
          maxLength={8}
          value={state.averageConsumption}
          onChange={(averageConsumption) => onChange({ averageConsumption })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t('otherCostsPerKilometer')}
          maxLength={12}
          value={state.otherCostsPerKilometer}
          onChange={(otherCostsPerKilometer) => onChange({ otherCostsPerKilometer })}
        />
      </div>
      <div className={styles.costSummary}>
        <h3>{t('costSummaryTitle')}</h3>
        <dl>
          <div>
            <dt>{t('monthlyFixedCost')}</dt>
            <dd>{summary.monthlyFixedCost ?? t('costNotInformed')}</dd>
          </div>
          <div>
            <dt>{t('costPerKilometer')}</dt>
            <dd>{summary.costPerKilometer ?? t('costNotInformed')}</dd>
          </div>
          <div>
            <dt>{t('fuelCostPerKilometer')}</dt>
            <dd>{summary.fuelCostPerKilometer ?? t('costNotInformed')}</dd>
          </div>
          <div>
            <dt>{t('otherCostsPerKilometer')}</dt>
            <dd>{summary.otherCostsPerKilometer ?? t('costNotInformed')}</dd>
          </div>
          <div>
            <dt>{t(fuelLabels.fuelPricePerUnit)}</dt>
            <dd>
              {fuelPrice === null
                ? t('fuelPriceUnavailable')
                : `${formatFuelPricePerUnit(fuelPrice.pricePerUnit)} · ${t(
                    `fuelPriceSource.${fuelPrice.source}`,
                  )}`}
            </dd>
          </div>
        </dl>
        {fuelPrice === null || fuelPrice.weekEndingOn === null ? null : (
          <p className={styles.fieldHint}>
            {`${t('fuelPriceWeek')} ${formatCostReferenceDate({
              locale: i18n.language,
              value: fuelPrice.weekEndingOn,
            })}`}
          </p>
        )}
        {costsUpdatedAt === null ? null : (
          <p className={styles.fieldHint}>
            {`${t('costsUpdatedAt')} ${formatCostReferenceDate({
              locale: i18n.language,
              value: costsUpdatedAt,
            })}`}
          </p>
        )}
      </div>
      <p className={styles.hint}>{t('vehicleCostHint')}</p>
    </fieldset>
  )
}
