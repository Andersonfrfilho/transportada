/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useCancelOccurrence } from '../queries/useOccurrenceCorrection.query'
import { OCCURRENCE_CANCELLATION_REASON_MAX_LENGTH } from '../shared/occurrence.constant'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import styles from '../styles/trip.module.css'

export type TripOccurrenceCancelDialogProps = Readonly<{
  documentId: string
  occurrenceId: string
  onClose: () => void
  tripId: string
}>

/**
 * Spec 235 RF3/CA04: o motivo sai com `trim` e o botão só habilita com texto de verdade — o `400` do
 * servidor é a segunda linha de defesa. O foco volta ao botão que abriu pelo `useModalDialog`.
 */
export function TripOccurrenceCancelDialog({
  documentId,
  occurrenceId,
  onClose,
  tripId,
}: TripOccurrenceCancelDialogProps) {
  const { t } = useTranslation('trip')
  const titleId = useId()
  const reasonId = useId()
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const [reason, setReason] = useState('')
  const cancellation = useCancelOccurrence()
  const isPending = cancellation.isPending

  function handleClose(): void {
    if (isPending) return
    onClose()
  }

  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: handleClose })
  const trimmedReason = reason.trim()
  const feedbackKey = resolveTripFeedbackKey(cancellation.error)

  useEffect(() => {
    reasonRef.current?.focus()
  }, [])

  function handleConfirm(): void {
    if (trimmedReason.length === 0) return
    cancellation.mutate(
      { documentId, occurrenceId, reason: trimmedReason, tripId },
      { onSuccess: onClose },
    )
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id={titleId}>{t('occurrenceDetail.correction.cancel.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>
              {t('occurrenceDetail.correction.cancel.hint')}
            </p>
          </div>
          <button
            aria-label={t('occurrenceDetail.correction.cancel.close')}
            className={styles.iconAction}
            disabled={isPending}
            onClick={handleClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <label htmlFor={reasonId}>{t('occurrenceDetail.correction.cancel.reasonLabel')}</label>
        <textarea
          autoComplete="off"
          id={reasonId}
          maxLength={OCCURRENCE_CANCELLATION_REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
          ref={reasonRef}
          value={reason}
        />

        {feedbackKey === null ? null : (
          <p className={styles.alert} role="alert">
            {t(`feedback.${feedbackKey}`)}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button
            disabled={isPending}
            onClick={handleClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('occurrenceDetail.correction.cancel.dismiss')}
          </Button>
          <Button
            disabled={trimmedReason.length === 0 || isPending}
            onClick={handleConfirm}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('occurrenceDetail.correction.cancel.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
