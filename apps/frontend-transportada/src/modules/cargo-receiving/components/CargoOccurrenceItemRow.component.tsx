/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import type { CargoDocumentProduct } from '../shared/cargoOccurrence.types'
import type { OccurrenceItemDraft } from '../shared/cargoOccurrenceForm.validation'
import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'
import { CargoOccurrenceItemControls } from './CargoOccurrenceItemControls.component'

type CargoOccurrenceItemRowProps = Readonly<{
  hasQuantityIssue: boolean
  isDisabled: boolean
  item: OccurrenceItemDraft | undefined
  onQuantityChange: (quantity: string) => void
  onToggle: () => void
  onUnitChange: (unit: string) => void
  product: CargoDocumentProduct
  quantityErrorId: string
}>

/** Um item da nota: marcar mostra a contagem e a unidade. */
export function CargoOccurrenceItemRow(props: CargoOccurrenceItemRowProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { item, product } = props

  return (
    <li
      className={dialogStyles.itemRow}
      data-product-code={product.code}
      data-selected={item !== undefined}
    >
      <div className={dialogStyles.itemHead}>
        <Checkbox
          ariaLabel={t('occurrence.items.itemLabel', {
            code: product.code,
            description: product.description,
          })}
          checked={item !== undefined}
          disabled={props.isDisabled}
          onChange={props.onToggle}
        />
        <span className={dialogStyles.itemText}>
          <span className={dialogStyles.itemCode}>{product.code}</span>
          <span className={dialogStyles.itemDescription}>{product.description}</span>
        </span>
      </div>
      {item === undefined ? null : <CargoOccurrenceItemControls {...props} item={item} />}
    </li>
  )
}
