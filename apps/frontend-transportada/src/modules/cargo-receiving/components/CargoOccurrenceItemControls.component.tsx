/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import type { CargoDocumentProduct } from '../shared/cargoOccurrence.types'
import {
  isOccurrenceQuantityValid,
  resolveOccurrenceItemUnitOptions,
  type OccurrenceItemDraft,
} from '../shared/cargoOccurrenceForm.validation'
import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'

type CargoOccurrenceItemControlsProps = Readonly<{
  hasQuantityIssue: boolean
  isDisabled: boolean
  item: OccurrenceItemDraft
  onQuantityChange: (quantity: string) => void
  onUnitChange: (unit: string) => void
  product: CargoDocumentProduct
  quantityErrorId: string
}>

/** A contagem e a unidade do item marcado. A unidade comercial do item vem escolhida; a quantidade é opcional. */
export function CargoOccurrenceItemControls(props: CargoOccurrenceItemControlsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { item, product } = props
  const quantityId = useId()
  const isInvalid = props.hasQuantityIssue && !isOccurrenceQuantityValid(item.quantity)

  return (
    <div className={dialogStyles.itemControls}>
      <label htmlFor={quantityId}>
        {t('occurrence.items.quantityField')}
        <input
          aria-describedby={isInvalid ? props.quantityErrorId : undefined}
          aria-invalid={isInvalid ? true : undefined}
          aria-label={t('occurrence.items.quantityLabel', { code: product.code })}
          disabled={props.isDisabled}
          id={quantityId}
          inputMode="decimal"
          onChange={(event) => props.onQuantityChange(event.target.value)}
          type="text"
          value={item.quantity}
        />
      </label>
      <Select
        ariaLabel={t('occurrence.items.unitLabel', { code: product.code })}
        disabled={props.isDisabled}
        onChange={props.onUnitChange}
        options={resolveOccurrenceItemUnitOptions(product.commercialUnit).map((unit) => ({
          label: t(`occurrence.items.unit.${unit}`, { defaultValue: unit }),
          value: unit,
        }))}
        value={item.unit}
      />
    </div>
  )
}
