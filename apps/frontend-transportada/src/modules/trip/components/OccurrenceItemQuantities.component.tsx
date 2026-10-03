/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import {
  resolveOccurrenceItemDefaultQuantityUnit,
  resolveOccurrenceItemQuantityUnitOptions,
  type OccurrenceQuantitiesByCode,
} from '../shared/occurrenceProductSelection.service'
import {
  OCCURRENCE_QUANTITY_UNITS,
  type OccurrenceFallbackQuantityUnit,
  type OccurrenceQuantityUnit,
} from '../shared/trip.constant'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type OccurrenceItemQuantitiesProps = Readonly<{
  onChange: (quantitiesByCode: OccurrenceQuantitiesByCode) => void
  productCodes: readonly string[]
  products: readonly TripDocumentProduct[]
  quantitiesByCode: OccurrenceQuantitiesByCode
}>

/** Spec 172 RF2: só o par unit/box tem nome traduzido — a unidade comercial da nota é rótulo cru. */
function isFallbackQuantityUnit(
  unit: OccurrenceQuantityUnit,
): unit is OccurrenceFallbackQuantityUnit {
  return (OCCURRENCE_QUANTITY_UNITS as readonly string[]).includes(unit)
}

/**
 * Spec 166 RF7: um campo de quantidade + unidade por item marcado, dividido entre o registro e a
 * correção. "A nota inteira" (lista vazia) não tem item a contar — o bloco só nasce com item.
 */
export function OccurrenceItemQuantities({
  onChange,
  productCodes,
  products,
  quantitiesByCode,
}: OccurrenceItemQuantitiesProps) {
  const { t } = useTranslation('trip')
  if (productCodes.length === 0) return null

  function describeProduct(code: string): null | string {
    return products.find((product) => product.code === code)?.description ?? null
  }

  /** Spec 172 RF2/RF3: a unidade comercial daquele item na nota — `null` é item sem unidade declarada. */
  function commercialUnitOf(code: string): null | string {
    return products.find((product) => product.code === code)?.commercialUnit ?? null
  }

  function handleQuantityChange(code: string, quantity: string): void {
    const current = quantitiesByCode.get(code)
    onChange(
      new Map(quantitiesByCode).set(code, {
        quantity,
        unit: current?.unit ?? resolveOccurrenceItemDefaultQuantityUnit(commercialUnitOf(code)),
      }),
    )
  }

  function handleUnitChange(code: string, unit: OccurrenceQuantityUnit): void {
    const current = quantitiesByCode.get(code)
    onChange(new Map(quantitiesByCode).set(code, { quantity: current?.quantity ?? '', unit }))
  }

  return (
    <div className={styles.occurrenceItemQuantityList}>
      {productCodes.map((code) => {
        const entry = quantitiesByCode.get(code)
        const commercialUnit = commercialUnitOf(code)
        const defaultUnit = resolveOccurrenceItemDefaultQuantityUnit(commercialUnit)
        const description = describeProduct(code)
        const baseUnits = resolveOccurrenceItemQuantityUnitOptions(commercialUnit)
        /** A unidade legada que a ocorrência já gravou continua escolhível — nunca some em silêncio. */
        const units =
          entry === undefined || baseUnits.includes(entry.unit)
            ? baseUnits
            : [entry.unit, ...baseUnits]
        return (
          <label key={code}>
            <span>
              {`${code}${description === null ? '' : ` — ${description}`}`}
              <span className={styles.hint}>{` · ${t('occurrence.quantityLabel')}`}</span>
            </span>
            <div className={styles.occurrenceItemQuantityFields}>
              <input
                aria-label={`${code} — ${t('occurrence.quantityLabel')}`}
                inputMode="decimal"
                min="0"
                onChange={(event) => handleQuantityChange(code, event.target.value)}
                step="0.001"
                type="number"
                value={entry?.quantity ?? ''}
              />
              <Select
                ariaLabel={`${code} — ${t('occurrence.quantityUnitLabel')}`}
                onChange={(unit) => handleUnitChange(code, unit)}
                options={units.map((unit) => ({
                  label: isFallbackQuantityUnit(unit)
                    ? t(`occurrence.quantityUnits.${unit}`)
                    : unit,
                  value: unit,
                }))}
                value={entry?.unit ?? defaultUnit}
              />
            </div>
          </label>
        )
      })}
    </div>
  )
}
