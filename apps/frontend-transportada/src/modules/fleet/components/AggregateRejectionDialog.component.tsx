/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/fleet.module.css'

type AggregateRejectionDialogProps = Readonly<{
  cancelLabel: string
  confirmLabel: string
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
  reasonLabel: string
  title: string
}>

/**
 * Uma recusa (candidatura, anexo do painel de documentos) sempre pede motivo. Um diálogo só, em vez
 * de três `<div role="dialog">` artesanais repetindo a mesma forma.
 */
export function AggregateRejectionDialog({
  cancelLabel,
  confirmLabel,
  isSubmitting,
  onCancel,
  onConfirm,
  reasonLabel,
  title,
}: AggregateRejectionDialogProps): ReactNode {
  const [reason, setReason] = useState('')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onCancel })
  const canConfirm = reason.trim().length > 0 && !isSubmitting

  return createPortal(
    <div className={styles.driverDialogOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="aggregate-rejection-dialog-title"
        aria-modal="true"
        className={styles.driverDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.driverDialogHeader}>
          <h2 id="aggregate-rejection-dialog-title">{title}</h2>
          <button
            aria-label={cancelLabel}
            className={styles.iconAction}
            onClick={onCancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <label>
          <span>{reasonLabel}</span>
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className={styles.formActions}>
          <Button onClick={onCancel} type="button" variant="ghost">
            <Icon name="close" />
            {cancelLabel}
          </Button>
          <Button disabled={!canConfirm} type="button" onClick={() => onConfirm(reason.trim())}>
            <Icon name="check" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
