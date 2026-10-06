/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import { CARGO_OCCURRENCE_FIELD, CARGO_OCCURRENCE_LIMITS } from '../shared/cargoOccurrence.constant'
import styles from '../styles/cargoOccurrence.module.css'

/** A observação opcional da avaria; passar do limite de caracteres é recusado no próprio campo. */
export function CargoOccurrenceNoteField({
  form,
}: Readonly<{ form: CargoOccurrenceFormController }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const issue = form.feedback.issueFor(CARGO_OCCURRENCE_FIELD.note)

  return (
    <label data-field={CARGO_OCCURRENCE_FIELD.note}>
      {t('occurrence.dialog.noteLabel')}
      <textarea
        aria-invalid={issue === undefined ? undefined : true}
        disabled={form.isSubmitting}
        maxLength={CARGO_OCCURRENCE_LIMITS.noteMaxLength}
        onChange={(event) => form.draft.setNote(event.target.value)}
        value={form.draft.draft.note}
      />
      {issue === undefined ? null : (
        <span className={styles.fieldError} role="alert">
          {t(`occurrence.issues.${issue.code}`, { max: issue.max })}
        </span>
      )}
    </label>
  )
}
