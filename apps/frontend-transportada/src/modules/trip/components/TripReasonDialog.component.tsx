/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/trip.module.css'

type TripReasonDialogProps = Readonly<{
  isOpen: boolean
  isSubmitting: boolean
  items?: readonly string[]
  onClose: () => void
  onSubmit: (reason: string) => void
  reasonLabel: string
  subtitle?: string
  submitLabel: string
  title: string
}>

/**
 * Diálogo genérico para toda ação que precisa de um motivo antes de confirmar — devolver nota
 * (uma ou em lote) e despachar com pendência (P2 da spec 056). Mesmo padrão de
 * `TripMdfePendingDialog`/`DeliveryAddressOverrideDialog`.
 */
export function TripReasonDialog({
  isOpen,
  isSubmitting,
  items,
  onClose,
  onSubmit,
  reasonLabel,
  subtitle,
  submitLabel,
  title,
}: TripReasonDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [reason, setReason] = useState('')

  if (!isOpen) return null

  function handleSubmit(): void {
    const trimmed = reason.trim()
    if (trimmed.length === 0) return
    onSubmit(trimmed)
    setReason('')
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-reason-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-reason-dialog-title">{title}</h2>
            {subtitle === undefined ? null : <p className={styles.mdfeGateSubtitle}>{subtitle}</p>}
          </div>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {items === undefined || items.length === 0 ? null : (
          <ul className={styles.mdfeGateList}>
            {items.map((item) => (
              <li className={styles.mdfeGateListItem} key={item}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <label>
          {reasonLabel}
          <input autoComplete="off" onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button
            disabled={reason.trim().length === 0 || isSubmitting}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {submitLabel}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
