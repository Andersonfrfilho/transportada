/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoOccurrenceFormController } from '../hooks/useCargoOccurrenceForm.hook'
import { CARGO_OCCURRENCE_FIELD } from '../shared/cargoOccurrence.constant'
import styles from '../styles/cargoOccurrence.module.css'
import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'
import { CargoOccurrencePhotoInputs } from './CargoOccurrencePhotoInputs.component'

type CargoOccurrencePhotoFieldProps = Readonly<{ form: CargoOccurrenceFormController }>

/** A foto da avaria: tirada na hora (câmera traseira) ou escolhida da galeria; reduzida no aparelho antes de subir. */
export function CargoOccurrencePhotoField({ form }: CargoOccurrencePhotoFieldProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const errorId = useId()
  const { draft } = form
  const failure = draft.photoFailure
  const issue =
    failure === undefined ? form.feedback.issueFor(CARGO_OCCURRENCE_FIELD.file) : { code: failure }
  const fileName = draft.draft.photo === undefined ? undefined : t('occurrence.photo.chosen')
  const isDisabled = form.isSubmitting || draft.isPreparingPhoto

  return (
    <div className={dialogStyles.photoField} data-field={CARGO_OCCURRENCE_FIELD.file}>
      <span className={styles.fieldTitle}>{t('occurrence.photo.label')}</span>
      {draft.photoPreviewUrl === undefined ? null : (
        <img
          alt={t('occurrence.photo.previewAlt')}
          className={dialogStyles.photoPreview}
          src={draft.photoPreviewUrl}
        />
      )}
      <CargoOccurrencePhotoInputs
        describedBy={issue === undefined ? undefined : errorId}
        fileName={fileName}
        isDisabled={isDisabled}
        isInvalid={issue !== undefined}
        onSelect={draft.setPhotoFile}
      />
      {draft.isPreparingPhoto ? (
        <p className={styles.noteHint} role="status">
          {t('occurrence.photo.preparing')}
        </p>
      ) : null}
      {issue === undefined ? null : (
        <p className={styles.fieldError} id={errorId} role="alert">
          {t(`occurrence.issues.${issue.code}`, { max: 'max' in issue ? issue.max : undefined })}
        </p>
      )}
    </div>
  )
}
