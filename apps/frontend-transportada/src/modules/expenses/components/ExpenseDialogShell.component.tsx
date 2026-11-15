/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/expenses.module.css'

type ExpenseDialogShellProps = Readonly<{
  children: ReactNode
  footer: ReactNode
  hint?: string
  onClose: () => void
  title: string
  titleId: string
}>

/** Moldura única dos diálogos de Contas: foco preso, Esc e tela cheia no celular (`useModalDialog`). */
export function ExpenseDialogShell({
  children,
  footer,
  hint,
  onClose,
  title,
  titleId,
}: ExpenseDialogShellProps) {
  const { t } = useTranslation('expenses')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}
          </div>
          <button
            aria-label={t('dialog.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
        <footer className={styles.dialogFooter}>{footer}</footer>
      </div>
    </div>,
    document.body,
  )
}
