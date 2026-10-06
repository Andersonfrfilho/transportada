/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useOccurrenceRegistrationForm } from '../hooks/useOccurrenceRegistrationForm.hook'
import { OccurrencePhotoField } from './OccurrencePhotoField.component'
import { OccurrenceProductsField } from './OccurrenceProductsField.component'
import { OccurrenceRegisterAction } from './OccurrenceRegisterAction.component'
import { OccurrenceSignatureField } from './OccurrenceSignatureField.component'
import type {
  DriverOccurrenceTypesState,
  DriverTripDocument,
  DriverTripStop,
} from '../shared/driverTrip.types'
import type { OccurrenceRegistrationHandlers } from '../shared/occurrenceDispatch.service'
import { resolveOccurrenceAttachmentMode } from '../shared/occurrenceRegistration.service'
import { resolveOccurrenceRequirements } from '../shared/occurrenceRequirements.service'
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
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { missingFields, preview, selectedType, visibility } = form
  const requirements =
    selectedType === undefined ? undefined : resolveOccurrenceRequirements(selectedType)
  const photoLimit = visibility?.photoLimit ?? 1

  function handleRetry(): void {
    onRetryOccurrenceTypes()
    panelRef.current?.focus()
  }

  /** Rascunho a que falta campo obrigatório não fecha o formulário: o que foi digitado fica. */
  function handleRegister(): void {
    if (form.handleRegister()) onClose()
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
          {visibility?.rendersNote === false ? null : (
            <label>
              <span>
                {t(
                  requirements?.noteMode === 'required'
                    ? 'occurrenceRegistration.noteRequired'
                    : 'occurrenceDescription',
                )}
              </span>
              <textarea
                maxLength={500}
                onChange={(event) => form.handleDescriptionChange(event.target.value)}
                rows={3}
                value={form.description}
              />
            </label>
          )}
          {preview === undefined ? null : (
            <div className={styles.occurrencePreview}>
              <p className={styles.occurrencePreviewTitle}>{t('occurrencePreview.title')}</p>
              <p className={styles.occurrencePreviewText}>
                {preview.notice === null ? t('occurrencePreview.none') : preview.notice.text}
              </p>
            </div>
          )}
          {visibility?.rendersPhoto === true ? (
            <OccurrencePhotoField
              isMissing={missingFields.includes('photo')}
              limit={photoLimit}
              onRemoveLast={form.handlePhotoRemove}
              onSelect={form.handlePhotoSelect}
              photoCount={form.photos.length}
              photoState={form.photoState}
              previewUrl={form.photoPreviewUrl}
            />
          ) : null}
          {visibility?.rendersProducts === true ? (
            <OccurrenceProductsField
              isMarked={form.hasProducts}
              onToggle={form.handleProductsToggle}
            />
          ) : null}
          {visibility?.rendersSignature === true ? (
            <OccurrenceSignatureField
              hasSignature={form.signature.signature !== undefined}
              isOpen={form.signature.isOpen}
              isRequired={requirements?.signatureMode === 'required'}
              onCancel={form.signature.handleCancel}
              onConfirm={form.signature.handleConfirm}
              onOpen={form.signature.handleOpen}
              previewUrl={form.signature.previewUrl}
            />
          ) : null}
        </>
      )}

      <OccurrenceRegisterAction
        canRegister={form.canRegister}
        missingFields={missingFields}
        onCancel={onClose}
        onRegister={handleRegister}
        photoMinimumCount={requirements?.photoMinimumCount ?? 1}
        rendersRegister={selectedType !== undefined}
      />
    </div>
  )
}
