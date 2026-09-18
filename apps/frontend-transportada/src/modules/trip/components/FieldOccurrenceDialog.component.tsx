/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { resolveFieldOccurrenceDialogMode } from '../shared/fieldOccurrenceBatch.service'
import type { FieldOccurrenceType } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type FieldOccurrenceSubmission = Readonly<{
  driverId?: string
  file?: File
  note: string
  occurrenceTypeId: string
}>

export type FieldOccurrenceDialogProps = Readonly<{
  documentIds: readonly string[]
  drivers: readonly Readonly<{ driverId: string; driverName: string }>[]
  hasMultipleDrivers: boolean
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (input: FieldOccurrenceSubmission) => void
  types: readonly FieldOccurrenceType[]
}>

/**
 * Spec 156 T9 (D7, aceite 10): `POST /trips/:id/documents/field-occurrences` — o mesmo diálogo serve
 * a ação da linha (`documentIds` com uma nota, capacidade `fieldOccurrence` do allowed-actions) e a
 * ação em massa da seleção existente (`documentIds` com o maço marcado). O tipo vem do catálogo de
 * rua (`GET /trips/occurrence-types/field`), não do vocabulário fixo de `TripStopOccurrenceDialog`
 * (ocorrência de parada, T8) — as duas rotas e os dois vocabulários são propositalmente diferentes.
 */
export function FieldOccurrenceDialog({
  documentIds,
  drivers,
  hasMultipleDrivers,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  types,
}: FieldOccurrenceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [occurrenceTypeId, setOccurrenceTypeId] = useState('')
  const [note, setNote] = useState('')
  const [driverId, setDriverId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setOccurrenceTypeId('')
    setNote('')
    setDriverId('')
    setFile(null)
  }, [isOpen])

  if (!isOpen) return null

  const mode = resolveFieldOccurrenceDialogMode(documentIds)
  const canSubmit = occurrenceTypeId !== '' && !isSubmitting

  function handleSubmit(): void {
    if (!canSubmit) return
    const driverIdInput = driverId === '' ? {} : { driverId }
    const fileInput = file === null ? {} : { file }
    onSubmit({ note: note.trim(), occurrenceTypeId, ...driverIdInput, ...fileInput })
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="field-occurrence-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="field-occurrence-title">
            {mode === 'batch'
              ? t('fieldOccurrence.batchTitle', { count: documentIds.length })
              : t('fieldOccurrence.title')}
          </h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {types.length === 0 ? (
          <p className={styles.hint}>{t('fieldOccurrence.empty')}</p>
        ) : (
          <label>
            {t('fieldOccurrence.typeLabel')}
            <Select
              ariaLabel={t('fieldOccurrence.typeLabel')}
              onChange={setOccurrenceTypeId}
              options={types.map((type) => ({ label: type.name, value: type.id }))}
              placeholder={t('fieldOccurrence.typePlaceholder')}
              value={occurrenceTypeId}
            />
          </label>
        )}

        {hasMultipleDrivers ? (
          <label>
            {t('fieldOccurrence.driverLabel')}
            <Select
              ariaLabel={t('fieldOccurrence.driverLabel')}
              onChange={setDriverId}
              options={drivers.map((driver) => ({
                label: driver.driverName,
                value: driver.driverId,
              }))}
              value={driverId}
            />
          </label>
        ) : null}

        <label>
          {t('fieldOccurrence.noteLabel')}
          <textarea onChange={(event) => setNote(event.target.value)} value={note} />
        </label>

        <FileField
          accept="image/*"
          actionLabel={t('fieldOccurrence.photoChoose')}
          {...(file === null ? {} : { fileName: file.name })}
          label={t('fieldOccurrence.photoLabel')}
          onSelect={(selected) => setFile(selected ?? null)}
          placeholder={t('fieldOccurrence.photoEmpty')}
          resetAfterSelect
        />
        <p className={styles.hint}>{t('fieldOccurrence.photoHint')}</p>
        {file === null ? null : (
          <Button onClick={() => setFile(null)} size="sm" type="button" variant="ghost">
            <Icon name="remove" />
            {t('fieldOccurrence.photoRemove')}
          </Button>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit} size="sm" type="button">
            <Icon name="check" />
            {mode === 'batch'
              ? t('fieldOccurrence.batchSubmit', { count: documentIds.length })
              : t('fieldOccurrence.submit')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
