/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/trip.module.css'

export type TripConfirmDialogProps = Readonly<{
  confirmLabel: string
  isOpen: boolean
  isSubmitting: boolean
  message: string
  onCancel: () => void
  onConfirm: () => void
  title: string
}>

/**
 * Confirmação genérica para uma ação irreversível sem motivo a digitar — `web.md` §15 (iniciar a
 * rota do escritório, spec 156 T8). Mesmo padrão visual de `TripReasonDialog`, sem o campo de
 * texto: aqui não há o que justificar, só o que confirmar.
 */
export function TripConfirmDialog({
  confirmLabel,
  isOpen,
  isSubmitting,
  message,
  onCancel,
  onConfirm,
  title,
}: TripConfirmDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: onCancel })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-confirm-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="trip-confirm-dialog-title">{title}</h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onCancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.mdfeGateSubtitle}>{message}</p>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm} size="sm" type="button">
            <Icon name="check" />
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
