/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import styles from '../styles/cargoOccurrence.module.css'
import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'
import { CargoOccurrenceItemRow } from './CargoOccurrenceItemRow.component'

type CargoOccurrenceItemListProps = Readonly<{
  allowsMultipleItems: boolean
  form: CargoOccurrenceFormController
  hasQuantityIssue: boolean
  quantityErrorId: string
}>

/** A lista de itens da nota; nota sem item diz isso em vez de deixar o campo vazio sem explicação. */
export function CargoOccurrenceItemList({
  allowsMultipleItems,
  form,
  hasQuantityIssue,
  quantityErrorId,
}: CargoOccurrenceItemListProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { draft } = form

  if (form.products.length === 0) {
    return <p className={styles.noteHint}>{t('occurrence.dialog.itemsEmpty')}</p>
  }
  return (
    <ul className={dialogStyles.itemList}>
      {form.products.map((product) => (
        <CargoOccurrenceItemRow
          hasQuantityIssue={hasQuantityIssue}
          isDisabled={form.isSubmitting}
          item={draft.draft.itemsByCode.get(product.code)}
          key={product.code}
          onQuantityChange={(quantity) => draft.setItemQuantity({ code: product.code, quantity })}
          onToggle={() => draft.toggleItem({ allowsMultipleItems, product })}
          onUnitChange={(unit) => draft.setItemUnit({ code: product.code, unit })}
          product={product}
          quantityErrorId={quantityErrorId}
        />
      ))}
    </ul>
  )
}
