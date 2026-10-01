/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { useOccurrenceRegistrationForm } from '../hooks/useOccurrenceRegistrationForm.hook'
import type {
  DriverOccurrenceTypesState,
  DriverTripDocument,
  DriverTripStop,
} from '../shared/driverTrip.types'
import {
  resolveOccurrenceAttachmentMode,
  type OccurrenceRegistrationHandlers,
} from '../shared/occurrenceRegistration.service'
import styles from '../styles/driverTrip.module.css'

type DriverOccurrenceRegistrationFormProps = Readonly<{
  document: DriverTripDocument
  handlers: OccurrenceRegistrationHandlers
  occurrenceTypes: DriverOccurrenceTypesState
  /** Registrou ou cancelou — quem abriu fecha. */
  onClose: () => void
  /** Spec 157 RF5: o toque em "Tentar de novo" quando a lista de tipos falhou. */
  onRetryOccurrenceTypes: () => void
  stop: DriverTripStop
}>

/** O mesmo texto da foto do "Não entreguei": é o mesmo bloco de captura, com a mesma redução. */
const PHOTO_ERROR_KEYS = {
  failed: 'notDelivered.photoFailed',
  'too-large': 'notDelivered.photoTooLarge',
} as const

/**
 * Spec 218 (RF-A5, D1): o botão único de ocorrência. Todos os tipos do catálogo, de nota e de
 * parada, numa lista só, cada um dizendo se pede foto. O motorista escolhe o tipo — a rota é o
 * `flow` dele que decide. A foto é **da ocorrência** (spec 209), nunca o canhoto da nota.
 */
export function DriverOccurrenceRegistrationForm({
  document,
  handlers,
  occurrenceTypes,
  onClose,
  onRetryOccurrenceTypes,
  stop,
}: DriverOccurrenceRegistrationFormProps) {
  const { t } = useTranslation('driverTrip')
  const form = useOccurrenceRegistrationForm({ document, handlers, occurrenceTypes, stop })
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const missingId = useId()
  const { missingFields, preview, selectedType } = form
  const photoErrorKey =
    form.photoState === 'failed' || form.photoState === 'too-large'
      ? PHOTO_ERROR_KEYS[form.photoState]
      : undefined

  function handleRetry(): void {
    onRetryOccurrenceTypes()
    panelRef.current?.focus()
  }

  function handleRegister(): void {
    form.handleRegister()
    onClose()
  }

  return (
    <div
      aria-labelledby={titleId}
      className={styles.occurrenceForm}
      ref={panelRef}
      role="group"
      tabIndex={-1}
    >
      <p className={styles.proofCaptureTitle} id={titleId}>
        {t('occurrenceRegistration.title')}
      </p>
      <p className={styles.stopMeta}>{t('documentOccurrenceHint')}</p>
      {occurrenceTypes.status === 'failed' ? (
        <div>
          <p className={styles.proofFieldError} role="alert">
            {t('documentOccurrenceTypesFailed')}
          </p>
          <Button onClick={handleRetry} type="button" variant="ghost">
            <Icon name="refresh" />
            {t('documentOccurrenceTypesRetry')}
          </Button>
        </div>
      ) : occurrenceTypes.status === 'loading' ? (
        <SkeletonGroup
          className={styles.occurrenceChips}
          label={t('documentOccurrenceTypesLoading')}
        >
          <Skeleton height="var(--control-height)" width="40%" />
          <Skeleton height="var(--control-height)" width="55%" />
        </SkeletonGroup>
      ) : form.types.length === 0 ? (
        <p className={styles.stopMeta}>{t('documentOccurrenceTypesEmpty')}</p>
      ) : (
        <div
          aria-label={t('occurrenceRegistration.legend')}
          className={styles.occurrenceChips}
          role="radiogroup"
        >
          {form.types.map((type) => (
            <Button
              aria-checked={type.id === selectedType?.id}
              className={styles.occurrenceChip}
              key={type.id}
              onClick={() => form.handleTypeSelect(type.id)}
              role="radio"
              type="button"
              variant={type.id === selectedType?.id ? 'default' : 'ghost'}
            >
              <span className={styles.occurrenceChipLabel}>
                <span>{type.name}</span>
                <span className={styles.occurrenceChipMode}>
                  {t(`occurrenceRegistration.attachment.${resolveOccurrenceAttachmentMode(type)}`)}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}

      {selectedType === undefined ? null : (
        <>
          <label>
            <span>{t('occurrenceDescription')}</span>
            <textarea
              maxLength={500}
              onChange={(event) => form.handleDescriptionChange(event.target.value)}
              rows={3}
              value={form.description}
            />
          </label>
          {preview === undefined ? null : (
            <div className={styles.occurrencePreview}>
              <p className={styles.occurrencePreviewTitle}>{t('occurrencePreview.title')}</p>
              <p className={styles.occurrencePreviewText}>
                {preview.notice === null ? t('occurrencePreview.none') : preview.notice.text}
              </p>
            </div>
          )}
          {form.rendersPhoto ? (
            <div className={styles.proofCapture}>
              <p className={styles.proofCaptureTitle}>{t('occurrencePhoto')}</p>
              {form.photoPreviewUrl === undefined || form.photo === undefined ? null : (
                <div className={styles.proofCaptureAttached} role="status">
                  <img
                    alt={t('notDelivered.photoPreview')}
                    className={styles.proofCaptureThumbnail}
                    src={form.photoPreviewUrl}
                  />
                  <span className={styles.proofCaptureAttachedText}>
                    <Icon name="check" />
                    {t('notDelivered.photoAttached')}
                  </span>
                </div>
              )}
              <div className={styles.proofCaptureGrid}>
                <FilePickerButton
                  accept="image/*"
                  capture="environment"
                  className={styles.proofCaptureAction}
                  inputRef={cameraFieldRef}
                  onSelect={form.handlePhotoSelect}
                >
                  <Icon name="camera" />
                  {form.photo === undefined ? t('choosePhoto') : t('proofCapture.retake')}
                  {missingFields.includes('photo') ? ' *' : ''}
                </FilePickerButton>
                <FilePickerButton
                  accept="image/*"
                  className={styles.proofCaptureAction}
                  inputRef={galleryFieldRef}
                  onSelect={form.handlePhotoSelect}
                >
                  <Icon name="upload" />
                  {t('proofCapture.attach')}
                </FilePickerButton>
              </div>
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
          ) : null}
          {missingFields.length > 0 ? (
            <p className={styles.notDeliveredMissing} id={missingId} role="status">
              {t('occurrenceRegistration.missingLead', {
                fields: missingFields.map((field) => t(`proofFields.missing.${field}`)).join(', '),
              })}
            </p>
          ) : null}
        </>
      )}

      <div className={styles.actions}>
        {selectedType === undefined ? null : (
          <Button
            aria-describedby={missingFields.length > 0 ? missingId : undefined}
            disabled={!form.canRegister}
            onClick={handleRegister}
            type="button"
          >
            <Icon name="save" />
            {t('occurrenceSend')}
          </Button>
        )}
        <Button onClick={onClose} type="button" variant="ghost">
          {t('occurrenceRegistration.cancel')}
        </Button>
      </div>
    </div>
  )
}
