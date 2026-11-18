/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatCpf } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/fleet.module.css'

const CPF_DIGITS = 11
const NON_DIGITS = /\D/gu

type AggregateDriverTaxIdDialogProps = Readonly<{
  cancelLabel: string
  confirmLabel: string
  hint: string
  isSubmitting: boolean
  label: string
  onCancel: () => void
  onConfirm: (cpf: string) => void
  title: string
}>

/**
 * Candidatura de pessoa jurídica: a ficha de motorista só guarda CPF, então quem aprova informa o
 * CPF de quem dirige. O CNPJ da candidatura vira o vínculo da ficha.
 */
export function AggregateDriverTaxIdDialog({
  cancelLabel,
  confirmLabel,
  hint,
  isSubmitting,
  label,
  onCancel,
  onConfirm,
  title,
}: AggregateDriverTaxIdDialogProps): ReactNode {
  const [digits, setDigits] = useState('')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onCancel })
  const canConfirm = digits.length === CPF_DIGITS && !isSubmitting

  return createPortal(
    <div
      className={`${styles.driverDialogOverlay} ${styles.driverDialogSheet}`}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        aria-labelledby="aggregate-driver-tax-id-dialog-title"
        aria-modal="true"
        className={styles.driverDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.driverDialogHeader}>
          <h2 id="aggregate-driver-tax-id-dialog-title">{title}</h2>
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
          <span>{label}</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={14}
            placeholder="000.000.000-00"
            required
            value={formatCpf(digits)}
            onChange={(event) =>
              setDigits(event.target.value.replaceAll(NON_DIGITS, '').slice(0, CPF_DIGITS))
            }
          />
        </label>
        <p className={styles.hint}>{hint}</p>
        <div className={styles.formActions}>
          <Button onClick={onCancel} type="button" variant="ghost">
            <Icon name="close" />
            {cancelLabel}
          </Button>
          <Button disabled={!canConfirm} type="button" onClick={() => onConfirm(digits)}>
            <Icon name="check" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
