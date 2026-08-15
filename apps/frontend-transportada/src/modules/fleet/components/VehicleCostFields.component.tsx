/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { FleetVehicleFormState } from '../shared/fleet.types'
import {
  formatCostReferenceDate,
  summarizeTypedVehicleCosts,
} from '../shared/fleetVehicleCost.service'
import styles from '../styles/fleet.module.css'
import { FleetField } from './FleetField.component'

type VehicleCostFieldsProps = Readonly<{
  costsUpdatedAt: null | string
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleCostFields({ costsUpdatedAt, onChange, state }: VehicleCostFieldsProps) {
  const { i18n, t } = useTranslation('fleet')
  const summary = summarizeTypedVehicleCosts(state)

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
        <FleetField
          optional
          inputMode="numeric"
          label={t('averageConsumption')}
          maxLength={8}
          value={state.averageConsumption}
          onChange={(averageConsumption) => onChange({ averageConsumption })}
        />
        <FleetField
          optional
          inputMode="numeric"
          label={t('costPerKilometer')}
          maxLength={12}
          value={state.costPerKilometer}
          onChange={(costPerKilometer) => onChange({ costPerKilometer })}
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
        </dl>
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
