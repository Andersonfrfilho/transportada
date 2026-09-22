/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  resolveTripArrivedAtIso,
  toDatetimeLocalValue,
  validateTripArrivedAt,
} from '../shared/tripArrivalValidation.service'
import styles from '../styles/trip.module.css'

export type TripArrivalDialogProps = Readonly<{
  dispatchedAt: null | string
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (arrivedAt: string) => void
}>

/**
 * Spec 156 T15 A1: `arrivedAt` opcional em `POST .../arrive` — o padrão é agora, editável como
 * "Entregue em" no assistente de baixa (mesma janela de relógio, `tripArrivalValidation.service.ts`).
 */
export function TripArrivalDialog({
  dispatchedAt,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: TripArrivalDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [arrivedAt, setArrivedAt] = useState(() => toDatetimeLocalValue(new Date()))

  if (!isOpen) return null

  const arrivedAtIso = resolveTripArrivedAtIso(arrivedAt)
  const error = validateTripArrivedAt({ arrivedAt: arrivedAtIso, dispatchedAt, now: new Date() })

  function handleSubmit(): void {
    if (error !== undefined) return
    onSubmit(arrivedAtIso)
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-arrival-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="trip-arrival-dialog-title">{t('fieldActions.arriveTitle')}</h2>
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
          {t('fieldActions.arrivedAtLabel')}
          <input
            onChange={(event) => setArrivedAt(event.target.value)}
            type="datetime-local"
            value={arrivedAt}
          />
        </label>
        {error === undefined ? null : (
          <p className={styles.notice} role="alert">
            {t(
              `feedback.${error === 'ARRIVED_AT_IN_FUTURE' ? 'arrivedAtInFuture' : 'arrivedAtBeforeDispatch'}`,
            )}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button
            disabled={error !== undefined || isSubmitting}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('fieldActions.arrive')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
