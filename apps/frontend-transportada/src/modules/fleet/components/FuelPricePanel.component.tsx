/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { FuelPriceEntry } from '@/modules/company-settings/shared/companySettingsClient.service'
import {
  formatFuelPricePerUnit,
  toFuelPricePerUnit,
} from '@/modules/company-settings/shared/fuelPrice.service'
import { FUEL_PRODUCTS, type FuelProduct } from '@/modules/shared/fuel.constant'

import type { FuelPriceAdjustment } from '../hooks/useFuelPrices.hook'
import styles from '../styles/fleet.module.css'

export type FuelPricePanelProps = Readonly<{
  disabled: boolean
  errorCode?: string
  loading: boolean
  onAdjust: (input: FuelPriceAdjustment) => void
  onClear: (product: FuelProduct) => void
  prices: readonly FuelPriceEntry[] | undefined
  saved: boolean
}>

function useWeekFormatter(): (value: string) => string {
  const { i18n } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (value) => formatter.format(new Date(`${value}T00:00:00.000Z`))
}

function FuelPriceSkeleton() {
  const { t } = useTranslation('fleet')
  return (
    <SkeletonGroup label={t('fuelPrices.title')}>
      {FUEL_PRODUCTS.map((product) => (
        <Skeleton
          key={`fuel-price-skeleton-${product}`}
          height="var(--field-height)"
          width="100%"
        />
      ))}
    </SkeletonGroup>
  )
}

function FuelPriceReferenceLine({ entry }: Readonly<{ entry: FuelPriceEntry }>) {
  const { t } = useTranslation('fleet')
  const formatWeek = useWeekFormatter()
  if (entry.reference === null)
    return <p className={styles.fieldHint}>{t('fuelPrices.referenceMissing')}</p>
  return (
    <p className={styles.fieldHint}>
      {t('fuelPrices.reference', {
        price: formatFuelPricePerUnit(entry.reference.pricePerUnit),
        state: entry.reference.state,
        week: formatWeek(entry.reference.weekEndingOn),
      })}
    </p>
  )
}

function FuelPriceRow(
  props: Readonly<{
    disabled: boolean
    entry: FuelPriceEntry | undefined
    onAdjust: (input: FuelPriceAdjustment) => void
    onClear: (product: FuelProduct) => void
    product: FuelProduct
  }>,
) {
  const { t } = useTranslation('fleet')
  const [draft, setDraft] = useState('')
  const price = toFuelPricePerUnit(draft)
  const invalid = draft !== '' && price === null
  const fieldId = `fuel-price-${props.product}`

  function handleAdjust() {
    if (price === null) return
    props.onAdjust({ pricePerUnit: price, product: props.product })
    setDraft('')
  }

  return (
    <div className={styles.fuelPriceRow}>
      <div className={styles.fuelPriceFacts}>
        <p className={styles.fuelPriceProduct}>{t(`fuelOption.${props.product}`)}</p>
        {props.entry?.effectivePricePerUnit == null ? (
          <p className={styles.fieldHint}>{t('fuelPrices.unavailable')}</p>
        ) : (
          <p className={styles.fuelPriceEffective}>
            {t('fuelPrices.effective', {
              price: formatFuelPricePerUnit(props.entry.effectivePricePerUnit),
              source: t(`fuelPriceSource.${props.entry.source ?? 'anp'}`),
            })}
          </p>
        )}
        {props.entry === undefined ? null : <FuelPriceReferenceLine entry={props.entry} />}
      </div>
      <div className={styles.fuelPriceForm}>
        <label htmlFor={fieldId}>
          {t('fuelPrices.fieldLabel', {
            unit: t(`fuelPrices.unit.${props.entry?.unit ?? 'litre'}`),
          })}
        </label>
        <input
          aria-invalid={invalid}
          disabled={props.disabled}
          id={fieldId}
          maxLength={20}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className={styles.fuelPriceActions}>
          <button
            className={styles.primaryAction}
            disabled={props.disabled || price === null}
            type="button"
            onClick={handleAdjust}
          >
            <Icon name="save" />
            {t('fuelPrices.save')}
          </button>
          {props.entry?.source === 'manual' && (
            <button
              className={styles.secondaryAction}
              disabled={props.disabled}
              type="button"
              onClick={() => props.onClear(props.product)}
            >
              <Icon name="refresh" />
              {t('fuelPrices.clear')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function FuelPricePanel(props: FuelPricePanelProps) {
  const { t } = useTranslation('fleet')
  return (
    <section className={styles.panel} aria-labelledby="fuel-prices-title">
      <h2 id="fuel-prices-title">{t('fuelPrices.title')}</h2>
      <p className={styles.hint}>{t('fuelPrices.hint')}</p>
      {props.loading ? (
        <FuelPriceSkeleton />
      ) : props.prices === undefined ? (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('fuelPrices.loadError')}
        </p>
      ) : (
        <div className={styles.fuelPriceList}>
          {FUEL_PRODUCTS.map((product) => (
            <FuelPriceRow
              key={`fuel-price-${product}`}
              disabled={props.disabled}
              entry={props.prices?.find((price) => price.product === product)}
              product={product}
              onAdjust={props.onAdjust}
              onClear={props.onClear}
            />
          ))}
        </div>
      )}
      {props.saved && (
        <p className={styles.fuelPriceStatusSuccess} role="status">
          {t('fuelPrices.saved')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('fuelPrices.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
