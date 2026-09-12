/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { WhatsAppPhonePanel } from './WhatsAppPhonePanel.component'
import styles from '../styles/whatsappPhone.module.css'

type WhatsAppPhoneDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
}>

/** Fullscreen no celular (base), diálogo centrado a partir de `40rem` — mesmo molde de `userAdministration.module.css`. */
export function WhatsAppPhoneDialog({
  isOpen,
  onClose,
}: WhatsAppPhoneDialogProps): JSX.Element | null {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="whatsapp-phone-dialog-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id="whatsapp-phone-dialog-title">{t('whatsappPhone.dialogTitle')}</h2>
          <Button
            aria-label={t('whatsappPhone.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>
        <WhatsAppPhonePanel />
      </div>
    </div>,
    document.body,
  )
}
