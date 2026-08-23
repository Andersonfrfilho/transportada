/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { EnergySettings } from '@/modules/company-settings/shared/companySettingsClient.service'
import { toFuelPricePerUnit } from '@/modules/company-settings/shared/fuelPrice.service'

import type { EnergyDistributorChoice } from '../hooks/useEnergySettings.hook'
import styles from '../styles/fleet.module.css'

/** O fator leva a tarifa seca ao que a conta cobra: imposto e bandeira quase a dobram, nunca a decuplicam. */
const ADJUSTMENT_FACTOR = /^[0-9]\.[0-9]{4}$/u

export type EnergySettingsPanelProps = Readonly<{
  disabled: boolean
  errorCode?: string
  loading: boolean
  onChoose: (input: EnergyDistributorChoice) => void
  onClear: () => void
  saved: boolean
  settings: EnergySettings | undefined
}>

function toAdjustmentFactor(draft: string): null | string {
  const factor = toFuelPricePerUnit(draft)
  if (factor === null || !ADJUSTMENT_FACTOR.test(factor)) return null
  return Number.parseFloat(factor) > 0 ? factor : null
}

function EnergySettingsSkeleton() {
  const { t } = useTranslation('fleet')
  return (
    <SkeletonGroup label={t('energySettings.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

/**
 * A escolha e o fator são salvos juntos porque a rota é uma só: mandar o fator sem distribuidora
 * gravaria um ajuste que nunca multiplica tarifa nenhuma.
 */
function EnergySettingsForm(
  props: Readonly<{
    disabled: boolean
    onChoose: (input: EnergyDistributorChoice) => void
    onClear: () => void
    settings: EnergySettings
  }>,
) {
  const { t } = useTranslation('fleet')
  const [distributorCode, setDistributorCode] = useState(props.settings.distributorCode ?? '')
  const [factorDraft, setFactorDraft] = useState(props.settings.adjustmentFactor)
  const adjustmentFactor = toAdjustmentFactor(factorDraft)
  const options = props.settings.distributors.map((distributor) => ({
    label: distributor.code,
    value: distributor.code,
  }))
  const factorFieldId = 'energy-adjustment-factor'

  function handleChoose() {
    if (adjustmentFactor === null || distributorCode === '') return
    props.onChoose({ adjustmentFactor, distributorCode })
  }

  return (
    <div className={styles.fuelPriceRow}>
      <div className={styles.fuelPriceFacts}>
        <p className={styles.fuelPriceProduct}>{t('energySettings.distributorLabel')}</p>
        <Select
          ariaLabel={t('energySettings.distributorLabel')}
          disabled={props.disabled || options.length === 0}
          emptyLabel={t('energySettings.emptyCatalog')}
          options={options}
          placeholder={t('energySettings.distributorPlaceholder')}
          value={distributorCode}
          onChange={setDistributorCode}
        />
        {options.length === 0 ? (
          <p className={styles.fieldHint}>{t('energySettings.emptyCatalog')}</p>
        ) : props.settings.distributorCode !== null ? null : (
          <p className={styles.fieldHint}>{t('energySettings.unchosen')}</p>
        )}
      </div>
      <div className={styles.fuelPriceForm}>
        <label htmlFor={factorFieldId}>{t('energySettings.factorLabel')}</label>
        <input
          aria-invalid={adjustmentFactor === null}
          disabled={props.disabled}
          id={factorFieldId}
          maxLength={10}
          value={factorDraft}
          onChange={(event) => setFactorDraft(event.target.value)}
        />
        <small className={styles.fieldHint}>{t('energySettings.factorHint')}</small>
        <div className={styles.fuelPriceActions}>
          <button
            className={styles.primaryAction}
            disabled={props.disabled || adjustmentFactor === null || distributorCode === ''}
            type="button"
            onClick={handleChoose}
          >
            <Icon name="save" />
            {t('energySettings.save')}
          </button>
          {props.settings.distributorCode !== null && (
            <button
              className={styles.secondaryAction}
              disabled={props.disabled}
              type="button"
              onClick={props.onClear}
            >
              <Icon name="refresh" />
              {t('energySettings.clear')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function EnergySettingsPanel(props: EnergySettingsPanelProps) {
  const { t } = useTranslation('fleet')
  return (
    <section className={styles.panel} aria-labelledby="energy-settings-title">
      <h2 id="energy-settings-title">{t('energySettings.title')}</h2>
      <p className={styles.hint}>{t('energySettings.hint')}</p>
      {props.loading ? (
        <EnergySettingsSkeleton />
      ) : props.settings === undefined ? (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('energySettings.loadError')}
        </p>
      ) : (
        <EnergySettingsForm
          key={props.settings.distributorCode ?? 'energy-unchosen'}
          disabled={props.disabled}
          settings={props.settings}
          onChoose={props.onChoose}
          onClear={props.onClear}
        />
      )}
      {props.saved && (
        <p className={styles.fuelPriceStatusSuccess} role="status">
          {t('energySettings.saved')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('energySettings.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
