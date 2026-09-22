/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { STOP_OCCURRENCE_KINDS, type StopOccurrenceKind } from '../shared/trip.types'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { TripDocumentDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type TripStopOccurrenceSubmission = Readonly<{
  description: string
  distanceMeters: number | null
  documentId: string | null
  kind: StopOccurrenceKind
}>

export type TripStopOccurrenceDialogProps = Readonly<{
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (input: TripStopOccurrenceSubmission) => void
  stopDocuments: readonly TripDocumentDetail[]
}>

function parseDistance(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
}

/**
 * Spec 156 T5/T8: `POST /trips/:id/stops/:stopId/occurrences` — a ocorrência de **parada**, com o
 * vocabulário fixo de `TRIP_STOP_OCCURRENCE_KINDS` (atraso, cais fechado, cobrança inesperada…).
 * Não confundir com `FieldOccurrenceDialog` (T9): aquela registra ocorrência **de nota**, com o
 * catálogo da empresa (`occurrenceTypeId`) — vocabulários e rotas diferentes.
 */
export function TripStopOccurrenceDialog({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  stopDocuments,
}: TripStopOccurrenceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  /** T16: começa vazio — pré-marcar o primeiro tipo gravava "cobrança inesperada" por descuido. */
  const [kind, setKind] = useState<'' | StopOccurrenceKind>('')
  const [description, setDescription] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [distance, setDistance] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setKind('')
    setDescription('')
    setDocumentId('')
    setDistance('')
  }, [isOpen])

  if (!isOpen) return null

  const canSubmit = kind !== '' && !isSubmitting

  function handleSubmit(): void {
    if (kind === '') return
    onSubmit({
      description: description.trim(),
      distanceMeters: parseDistance(distance),
      documentId: documentId === '' ? null : documentId,
      kind,
    })
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-stop-occurrence-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="trip-stop-occurrence-title">{t('fieldActions.occurrenceTitle')}</h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <label>
          {t('fieldActions.occurrenceKindLabel')}
          <Select
            ariaLabel={t('fieldActions.occurrenceKindLabel')}
            onChange={(value) => setKind(value as StopOccurrenceKind)}
            options={STOP_OCCURRENCE_KINDS.map((value) => ({
              label: t(`fieldActions.occurrenceKind.${value}`),
              value,
            }))}
            placeholder={t('fieldActions.occurrenceKindPlaceholder')}
            value={kind}
          />
        </label>

        {stopDocuments.length === 0 ? null : (
          <label>
            {t('fieldActions.occurrenceDocumentLabel')}
            <Select
              ariaLabel={t('fieldActions.occurrenceDocumentLabel')}
              clearable
              onChange={setDocumentId}
              options={stopDocuments.map((document) => ({
                label: tripDocumentLabel(document),
                value: document.id,
              }))}
              placeholder={t('fieldActions.occurrenceDocumentPlaceholder')}
              value={documentId}
            />
          </label>
        )}

        <label>
          {t('fieldActions.occurrenceDescriptionLabel')}
          <textarea onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
        <label>
          {t('fieldActions.occurrenceDistanceLabel')}
          <input
            autoComplete="off"
            inputMode="numeric"
            onChange={(event) => setDistance(event.target.value)}
            value={distance}
          />
        </label>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit} size="sm" type="button">
            <Icon name="check" />
            {t('fieldActions.occurrenceSubmit')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
