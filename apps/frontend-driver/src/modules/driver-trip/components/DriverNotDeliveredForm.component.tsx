/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { useNotDeliveredForm } from '../hooks/useNotDeliveredForm.hook'
import { DRIVER_RETURN_REASONS, type DriverOccurrenceTypesState } from '../shared/driverTrip.types'
import type { NotDeliveredDraft } from '../shared/notDelivered.service'
import styles from '../styles/driverTrip.module.css'

type DriverNotDeliveredFormProps = Readonly<{
  occurrenceTypes: DriverOccurrenceTypesState
  onCancel: () => void
  onConfirm: (draft: NotDeliveredDraft) => void
  onRetryOccurrenceTypes: () => void
}>

const PHOTO_ERROR_KEYS = {
  failed: 'notDelivered.photoFailed',
  'too-large': 'notDelivered.photoTooLarge',
} as const

/**
 * Spec 179 (T302), ajuste do usuário de 25/09: "Não entreguei" registra a ocorrência da nota com
 * foto — o motivo da devolução, o tipo de ocorrência da empresa, a foto (câmera, e a galeria quando
 * a câmera não abre ou foi negada) e a observação. O confirmar só habilita com tudo o que o servidor
 * exige, e o texto ao lado diz o que falta.
 */
export function DriverNotDeliveredForm({
  occurrenceTypes,
  onCancel,
  onConfirm,
  onRetryOccurrenceTypes,
}: DriverNotDeliveredFormProps) {
  const { t } = useTranslation('driverTrip')
  const form = useNotDeliveredForm(occurrenceTypes)
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const missingId = useId()
  const noteId = useId()
  const photoErrorKey =
    form.photoState === 'failed' || form.photoState === 'too-large'
      ? PHOTO_ERROR_KEYS[form.photoState]
      : undefined
  const missingText = form.missing.map((field) => t(`notDelivered.missing.${field}`)).join(', ')

  return (
    <fieldset className={styles.occurrenceForm}>
      <legend>{t('return')}</legend>

      <p className={styles.notDeliveredLegend}>{t('returnTitle')}</p>
      <div aria-label={t('returnTitle')} className={styles.occurrenceChips} role="radiogroup">
        {DRIVER_RETURN_REASONS.map((reason) => (
          <Button
            aria-checked={form.draft.reason === reason}
            className={styles.occurrenceChip}
            key={reason}
            onClick={() => form.handleReasonSelect(reason)}
            role="radio"
            type="button"
            variant={form.draft.reason === reason ? 'default' : 'ghost'}
          >
            {t(`returnReason.${reason}`)}
          </Button>
        ))}
      </div>

      <p className={styles.notDeliveredLegend}>{t('notDelivered.occurrenceTypeLegend')}</p>
      {occurrenceTypes.status === 'loading' ? (
        <SkeletonGroup
          className={styles.occurrenceChips}
          label={t('documentOccurrenceTypesLoading')}
        >
          <Skeleton height="var(--control-height)" width="40%" />
          <Skeleton height="var(--control-height)" width="55%" />
        </SkeletonGroup>
      ) : form.availableTypes === undefined ? (
        <div className={styles.proofField}>
          <p className={styles.proofFieldError} role="alert">
            {occurrenceTypes.status === 'failed'
              ? t('documentOccurrenceTypesFailed')
              : t('documentOccurrenceTypesEmpty')}
          </p>
          <p className={styles.stopMeta}>{t('notDelivered.withoutOccurrence')}</p>
          {occurrenceTypes.status === 'failed' ? (
            <div className={styles.actions}>
              <Button onClick={onRetryOccurrenceTypes} type="button" variant="ghost">
                <Icon name="refresh" />
                {t('documentOccurrenceTypesRetry')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          aria-label={t('notDelivered.occurrenceTypeLegend')}
          className={styles.occurrenceChips}
          role="radiogroup"
        >
          {form.availableTypes.map((occurrenceType) => (
            <Button
              aria-checked={form.draft.occurrenceTypeId === occurrenceType.id}
              className={styles.occurrenceChip}
              key={occurrenceType.id}
              onClick={() => form.handleOccurrenceTypeSelect(occurrenceType.id)}
              role="radio"
              type="button"
              variant={form.draft.occurrenceTypeId === occurrenceType.id ? 'default' : 'ghost'}
            >
              {occurrenceType.name}
            </Button>
          ))}
        </div>
      )}

      {form.availableTypes === undefined ? null : (
        <>
          <div className={styles.proofField}>
            <p className={styles.notDeliveredLegend}>{`${t('notDelivered.photoLabel')} *`}</p>
            {form.photoPreviewUrl === undefined ? null : (
              <img
                alt={t('notDelivered.photoPreview')}
                className={styles.notDeliveredPhotoPreview}
                src={form.photoPreviewUrl}
              />
            )}
            <FileField
              resetAfterSelect
              accept="image/*"
              actionLabel={t('notDelivered.takePhoto')}
              capture="environment"
              inputRef={cameraFieldRef}
              label={t('notDelivered.takePhoto')}
              placeholder={
                form.draft.photo === undefined
                  ? t('notDelivered.noPhoto')
                  : form.draft.photo.fileName
              }
              onSelect={form.handlePhotoSelect}
            />
            <FileField
              resetAfterSelect
              accept="image/*"
              actionLabel={t('notDelivered.chooseFromGallery')}
              inputRef={galleryFieldRef}
              label={t('notDelivered.chooseFromGallery')}
              placeholder={t('notDelivered.galleryHint')}
              onSelect={form.handlePhotoSelect}
            />
            {form.photoState === 'reading' ? (
              <p className={styles.stopMeta} role="status">
                {t('notDelivered.photoReading')}
              </p>
            ) : null}
            {photoErrorKey === undefined ? null : (
              <p className={styles.proofFieldError} role="alert">
                {t(photoErrorKey)}
              </p>
            )}
          </div>

          <div className={styles.proofField}>
            <label htmlFor={noteId}>
              {`${t('notDelivered.noteLabel')} (${t(
                form.isNoteRequired ? 'notDelivered.noteRequired' : 'notDelivered.noteOptional',
              )})`}
            </label>
            <textarea
              aria-invalid={form.missing.includes('note')}
              id={noteId}
              maxLength={500}
              onChange={(event) => form.handleNoteChange(event.target.value)}
              rows={3}
              value={form.draft.note}
            />
          </div>
        </>
      )}

      {form.canConfirm ? null : (
        <p className={styles.notDeliveredMissing} id={missingId} role="status">
          {t('notDelivered.missingLead', { fields: missingText })}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          aria-describedby={form.canConfirm ? undefined : missingId}
          disabled={!form.canConfirm}
          onClick={() => onConfirm(form.draft)}
          type="button"
        >
          <Icon name="check" />
          {t('notDelivered.confirm')}
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          {t('notDelivered.cancel')}
        </Button>
      </div>
    </fieldset>
  )
}
