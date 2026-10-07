/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import { CARGO_OCCURRENCE_FIELD } from '../shared/cargoOccurrence.constant'
import styles from '../styles/cargoOccurrence.module.css'

type CargoOccurrenceTypeFieldProps = Readonly<{ form: CargoOccurrenceFormController }>

/** O tipo da ocorrência de recebimento; o `data-field` é o endereço do atalho do aviso de recusa. */
export function CargoOccurrenceTypeField({ form }: CargoOccurrenceTypeFieldProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const issue = form.feedback.issueFor(CARGO_OCCURRENCE_FIELD.occurrenceTypeId)

  return (
    <div className={styles.fieldGroup} data-field={CARGO_OCCURRENCE_FIELD.occurrenceTypeId}>
      <span className={styles.fieldTitle}>{t('occurrence.dialog.typeLabel')}</span>
      <Select
        ariaLabel={t('occurrence.dialog.typeLabel')}
        disabled={form.isSubmitting || form.hasNoTypes}
        onChange={form.draft.setTypeId}
        options={form.types.map((type) => ({ label: type.name, value: type.id }))}
        placeholder={t('occurrence.dialog.typePlaceholder')}
        value={form.draft.draft.typeId}
      />
      {form.hasNoTypes ? (
        <p className={styles.fieldError} data-types-empty="" role="status">
          {t('occurrence.dialog.typesEmpty')}
        </p>
      ) : null}
      {issue === undefined ? null : (
        <p className={styles.fieldError} role="alert">
          {t(`occurrence.issues.${issue.code}`, { max: issue.max })}
        </p>
      )}
    </div>
  )
}
