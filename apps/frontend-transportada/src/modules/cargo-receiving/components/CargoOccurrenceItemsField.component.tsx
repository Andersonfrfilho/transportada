/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import { CARGO_OCCURRENCE_FIELD } from '../shared/cargoOccurrence.constant'
import styles from '../styles/cargoOccurrence.module.css'
import { CargoOccurrenceItemList } from './CargoOccurrenceItemList.component'

type CargoOccurrenceItemsFieldProps = Readonly<{ form: CargoOccurrenceFormController }>

/** Os itens da nota que a avaria atinge: marcar, contar e escolher a unidade — quantidade é opcional. */
export function CargoOccurrenceItemsField({
  form,
}: CargoOccurrenceItemsFieldProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const quantityErrorId = useId()
  const { feedback, selectedType } = form
  const allowsMultipleItems = selectedType?.allowsMultipleItems ?? true
  const itemsIssue = feedback.issueFor(CARGO_OCCURRENCE_FIELD.productCodes)
  const quantityIssue = feedback.issueFor(CARGO_OCCURRENCE_FIELD.productQuantities)
  if (selectedType?.itemsMode === 'off') return null

  return (
    <>
      <div className={styles.fieldGroup} data-field={CARGO_OCCURRENCE_FIELD.productCodes}>
        <span className={styles.fieldTitle}>{t('occurrence.dialog.itemsLabel')}</span>
        <p className={styles.noteHint}>
          {t(
            allowsMultipleItems
              ? 'occurrence.dialog.itemsHint'
              : 'occurrence.dialog.itemsHintSingle',
          )}
        </p>
        <CargoOccurrenceItemList
          allowsMultipleItems={allowsMultipleItems}
          form={form}
          hasQuantityIssue={quantityIssue !== undefined}
          quantityErrorId={quantityErrorId}
        />
        {itemsIssue === undefined ? null : (
          <p className={styles.fieldError} role="alert">
            {t(`occurrence.issues.${itemsIssue.code}`)}
          </p>
        )}
      </div>
      {quantityIssue === undefined ? null : (
        <p
          className={styles.fieldError}
          data-field={CARGO_OCCURRENCE_FIELD.productQuantities}
          id={quantityErrorId}
          role="alert"
          tabIndex={-1}
        >
          {t(`occurrence.issues.${quantityIssue.code}`)}
        </p>
      )}
    </>
  )
}
