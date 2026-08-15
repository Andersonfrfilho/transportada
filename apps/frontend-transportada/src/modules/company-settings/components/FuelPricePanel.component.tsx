/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { FUEL_PRODUCTS, type FuelProduct } from '@/modules/shared/fuel.constant'

import type { FuelPriceAdjustment } from '../hooks/useFuelPrices.hook'
import type { FuelPriceEntry } from '../shared/companySettingsClient.service'
import {
  FUEL_PRICE_SOURCE_LABEL_KEYS,
  formatFuelPricePerUnit,
  toFuelPricePerUnit,
} from '../shared/fuelPrice.service'
import styles from '../styles/companySettings.module.css'

type FuelPricePanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onAdjust: (input: FuelPriceAdjustment) => void
  onClear: (product: FuelProduct) => void
  prices: readonly FuelPriceEntry[] | undefined
  saved: boolean
}>

function useWeekFormatter(): (value: string) => string {
  const { i18n } = useTranslation('companySettings')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (value) => formatter.format(new Date(`${value}T00:00:00.000Z`))
}

function FuelPriceSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('fuelPricesTitle')}>
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
  const { t } = useTranslation('companySettings')
  const formatWeek = useWeekFormatter()
  if (entry.reference === null)
    return <p className={styles.fieldHint}>{t('fuelPriceReferenceMissing')}</p>
  return (
    <p className={styles.fieldHint}>
      {t('fuelPriceReference', {
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
  const { t } = useTranslation('companySettings')
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
          <p className={styles.fieldHint}>{t('fuelPriceUnavailable')}</p>
        ) : (
          <p className={styles.scheduledDistributionState}>
            {t('fuelPriceEffective', {
              price: formatFuelPricePerUnit(props.entry.effectivePricePerUnit),
              source: t(
                props.entry.source === null
                  ? 'fuelPriceSourceAnp'
                  : FUEL_PRICE_SOURCE_LABEL_KEYS[props.entry.source],
              ),
            })}
          </p>
        )}
        {props.entry === undefined ? null : <FuelPriceReferenceLine entry={props.entry} />}
      </div>
      <div className={styles.fuelPriceForm}>
        <label htmlFor={fieldId}>
          {t('fuelPriceFieldLabel', { unit: t(`fuelPriceUnit.${props.entry?.unit ?? 'litre'}`) })}
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
            {t('fuelPriceSave')}
          </button>
          {props.entry?.source === 'manual' && (
            <button
              className={styles.secondaryAction}
              disabled={props.disabled}
              type="button"
              onClick={() => props.onClear(props.product)}
            >
              <Icon name="refresh" />
              {t('fuelPriceClear')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function FuelPricePanel(props: FuelPricePanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section className={styles.certificateForm} aria-labelledby="fuel-prices-title">
      <h2 id="fuel-prices-title">{t('fuelPricesTitle')}</h2>
      <p className={styles.fieldHint}>{t('fuelPricesHint')}</p>
      {props.loading ? (
        <FuelPriceSkeleton />
      ) : props.prices === undefined ? (
        <p className={styles.formStatusError} role="alert">
          {t('fuelPriceLoadError')}
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
        <p className={styles.formStatusSuccess} role="status">
          {t('fuelPriceSaved')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('fuelPriceError', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
