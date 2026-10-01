/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  CANHOTO_REJECT_CLIENT_ERROR_KEY,
  CANHOTO_REJECT_ERROR_KEY,
  CANHOTO_REJECT_NOTE_REASON,
  CANHOTO_REJECT_SERVER_ERROR_KEY,
  type CanhotoRejectErrorKey,
} from '../shared/canhotoRejectDialog.constant'
import {
  CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH,
  CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH,
  validateCanhotoReviewNote,
} from '../shared/canhotoReviewNote.validation'
import type { DeliveryProofCanhotoReviewReason } from '../shared/deliveryProof.service'
import { DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS } from '../shared/trip.constant'
import styles from '../styles/trip.module.css'

const DEFAULT_REASON = DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS[0]

export type CanhotoRejectSubmission = Readonly<{
  note?: string
  reason: DeliveryProofCanhotoReviewReason
}>

type CanhotoRejectDialogProps = Readonly<{
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (submission: CanhotoRejectSubmission) => void
  serverErrorCode?: string
}>

function isReviewReason(value: string): value is DeliveryProofCanhotoReviewReason {
  return (DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS as readonly string[]).includes(value)
}

function resolveNoteError(note: string): CanhotoRejectErrorKey | undefined {
  if (note.trim().length === 0) return CANHOTO_REJECT_ERROR_KEY.REQUIRED
  const error = validateCanhotoReviewNote(note)
  return error === undefined ? undefined : CANHOTO_REJECT_CLIENT_ERROR_KEY[error]
}

export function CanhotoRejectDialog({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  serverErrorCode,
}: CanhotoRejectDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [reason, setReason] = useState<DeliveryProofCanhotoReviewReason>(DEFAULT_REASON)
  const [note, setNote] = useState('')
  const [clientError, setClientError] = useState<CanhotoRejectErrorKey | undefined>()

  /** Nada sobrevive a um fechamento sem confirmar — cada abertura começa do padrão. */
  useEffect(() => {
    if (!isOpen) return
    setReason(DEFAULT_REASON)
    setNote('')
    setClientError(undefined)
  }, [isOpen])

  if (!isOpen) return null

  const hasNoteField = reason === CANHOTO_REJECT_NOTE_REASON
  const serverError =
    serverErrorCode === undefined
      ? undefined
      : (CANHOTO_REJECT_SERVER_ERROR_KEY[serverErrorCode] ??
        CANHOTO_REJECT_ERROR_KEY.REQUEST_FAILED)
  const visibleError = clientError ?? serverError

  function handleSubmit() {
    if (!hasNoteField) {
      onSubmit({ reason })
      return
    }
    const noteError = resolveNoteError(note)
    setClientError(noteError)
    if (noteError === undefined) onSubmit({ note, reason })
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="canhoto-reject-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="canhoto-reject-dialog-title">
            {t('deliveryProof.canhotoReview.rejectDialog.title')}
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

        <label>
          {t('deliveryProof.canhotoReview.rejectDialog.reasonLabel')}
          <Select
            ariaLabel={t('deliveryProof.canhotoReview.rejectDialog.reasonLabel')}
            onChange={(value) => {
              if (isReviewReason(value)) setReason(value)
              setClientError(undefined)
            }}
            options={DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS.map((option) => ({
              label: t(`deliveryProof.canhotoReview.reason.${option}`),
              value: option,
            }))}
            value={reason}
          />
        </label>

        {hasNoteField ? (
          <label>
            {t('deliveryProof.canhotoReview.rejectDialog.noteLabel')}
            <textarea
              aria-label={t('deliveryProof.canhotoReview.rejectDialog.noteLabel')}
              onChange={(event) => {
                setNote(event.target.value)
                setClientError(undefined)
              }}
              value={note}
            />
            <span className={styles.counter}>
              {t('deliveryProof.canhotoReview.rejectDialog.counter', {
                length: note.length,
                maximum: CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH,
              })}
            </span>
          </label>
        ) : null}

        {visibleError === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`deliveryProof.canhotoReview.rejectDialog.error.${visibleError}`, {
              maximum: CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH,
              minimum: CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH,
            })}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('deliveryProof.canhotoReview.rejectDialog.cancel')}
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} size="sm" type="button">
            <Icon name="check" />
            {t('deliveryProof.canhotoReview.reject')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
