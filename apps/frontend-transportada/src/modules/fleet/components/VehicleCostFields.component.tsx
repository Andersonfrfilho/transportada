/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { FUEL_PRODUCTS } from '@/modules/shared/fuel.constant'

import type { FleetVehicleFormState, FleetVehicleFuelPrice } from '../shared/fleet.types'
import {
  formatCostReferenceDate,
  formatFuelPricePerUnit,
  resolveFuelLabelKeys,
  summarizeTypedVehicleCosts,
  VEHICLE_COST_FIELD_SCALE,
} from '../shared/fleetVehicleCost.service'
import {
  listSecondaryFuelOptions,
  resolveFuelArrangementLabelKey,
} from '../shared/fuelArrangement.service'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetMoneyField, FleetSelectField } from './FleetField.component'

type VehicleCostFieldsProps = Readonly<{
  costsUpdatedAt: null | string
  fuelPrice: FleetVehicleFuelPrice | null
  onChange: (values: Partial<FleetVehicleFormState>) => void
  secondaryFuelPrice: FleetVehicleFuelPrice | null
  state: FleetVehicleFormState
}>

export function VehicleCostFields({
  costsUpdatedAt,
  fuelPrice,
  onChange,
  secondaryFuelPrice,
  state,
}: VehicleCostFieldsProps) {
  const { i18n, t } = useTranslation('fleet')
  const fuelLabels = resolveFuelLabelKeys(state.fuelType)
  const secondaryFuelLabels =
    state.secondaryFuelType === '' ? null : resolveFuelLabelKeys(state.secondaryFuelType)
  const summary = summarizeTypedVehicleCosts({
    fields: state,
    fuelPricePerUnit: fuelPrice?.pricePerUnit ?? null,
    secondaryFuelPricePerUnit: secondaryFuelPrice?.pricePerUnit ?? null,
  })

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleCostLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetMoneyField
          optional
          label={t('acquisitionAmount')}
          scale={VEHICLE_COST_FIELD_SCALE.acquisitionAmount.form}
          value={state.acquisitionAmount}
          onChange={(acquisitionAmount) => onChange({ acquisitionAmount })}
        />
        <FleetMoneyField
          optional
          label={t('monthlyInstallmentAmount')}
          scale={VEHICLE_COST_FIELD_SCALE.monthlyInstallmentAmount.form}
          value={state.monthlyInstallmentAmount}
          onChange={(monthlyInstallmentAmount) => onChange({ monthlyInstallmentAmount })}
        />
        <FleetMoneyField
          optional
          label={t('annualVehicleTaxAmount')}
          scale={VEHICLE_COST_FIELD_SCALE.annualVehicleTaxAmount.form}
          value={state.annualVehicleTaxAmount}
          onChange={(annualVehicleTaxAmount) => onChange({ annualVehicleTaxAmount })}
        />
        <FleetMoneyField
          optional
          label={t('annualInsuranceAmount')}
          scale={VEHICLE_COST_FIELD_SCALE.annualInsuranceAmount.form}
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
        <FleetSelectField
          clearable
          label={t('secondaryFuelType')}
          optionLabelKey="fuelOption"
          options={listSecondaryFuelOptions(state.fuelType)}
          placeholder={t('secondaryFuelNone')}
          value={state.secondaryFuelType}
          onChange={(secondaryFuelType) => onChange({ secondaryFuelType })}
        />
        {secondaryFuelLabels === null ? null : (
          <FleetField
            optional
            inputMode="numeric"
            label={t(secondaryFuelLabels.averageConsumption)}
            maxLength={8}
            value={state.secondaryAverageConsumption}
            onChange={(secondaryAverageConsumption) => onChange({ secondaryAverageConsumption })}
          />
        )}
        <FleetMoneyField
          optional
          label={t('otherCostsPerKilometer')}
          scale={VEHICLE_COST_FIELD_SCALE.otherCostsPerKilometer.form}
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
            <dt>{t('fuelArrangementTitle')}</dt>
            <dd>{t(resolveFuelArrangementLabelKey(state))}</dd>
          </div>
          <div>
            <dt>{t('fuelCostPerKilometer')}</dt>
            <dd>{summary.fuelCostPerKilometer ?? t('costNotInformed')}</dd>
          </div>
          <div>
            <dt>{t('otherCostsPerKilometer')}</dt>
            <dd>{summary.otherCostsPerKilometer ?? t('costNotInformed')}</dd>
          </div>
          {summary.primaryFuelCostPerKilometer === null ||
          summary.secondaryFuelCostPerKilometer === null ? null : (
            <>
              {/* A média não bate com nenhuma das duas notas do posto: as parcelas são o que a explica */}
              <div>
                <dt>{t('primaryFuelCostPerKilometer')}</dt>
                <dd>{summary.primaryFuelCostPerKilometer}</dd>
              </div>
              <div>
                <dt>{t('secondaryFuelCostPerKilometer')}</dt>
                <dd>{summary.secondaryFuelCostPerKilometer}</dd>
              </div>
            </>
          )}
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
          {secondaryFuelLabels === null ? null : (
            <div>
              <dt>{t(secondaryFuelLabels.fuelPricePerUnit)}</dt>
              <dd>
                {secondaryFuelPrice === null
                  ? t('fuelPriceUnavailable')
                  : `${formatFuelPricePerUnit(secondaryFuelPrice.pricePerUnit)} · ${t(
                      `fuelPriceSource.${secondaryFuelPrice.source}`,
                    )}`}
              </dd>
            </div>
          )}
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
