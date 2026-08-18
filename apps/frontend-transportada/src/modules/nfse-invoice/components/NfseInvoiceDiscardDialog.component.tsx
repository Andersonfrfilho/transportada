/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceDiscardDialogProps = Readonly<{
  actions: NfseInvoiceRowActionsController
}>

export function NfseInvoiceDiscardDialog({ actions }: NfseInvoiceDiscardDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const isOpen = actions.discardTarget !== null
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: actions.closeDiscard })

  if (actions.discardTarget === null) return null

  const invoice = actions.discardTarget

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-discard-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-discard-title">{t('discardDialog.title')}</h2>
            <p className={styles.emissionHint}>
              {invoice.takerLegalName} · {formatAmount(invoice.serviceAmount)}
            </p>
          </div>
          <button
            aria-label={t('discardDialog.close')}
            className={styles.iconAction}
            onClick={actions.closeDiscard}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.emissionHint} role="alert">
          {t('discardDialog.warning')}
        </p>

        {actions.discardErrorCode !== null && (
          <p className={styles.placeholder} role="alert">
            {t('discardDialog.failed')}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={actions.closeDiscard} type="button">
            <Icon name="close" />
            {t('discardDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={actions.isDiscardPending}
            onClick={actions.confirmDiscard}
            type="button"
          >
            <Icon name="remove" />
            {actions.isDiscardPending ? t('discardDialog.sending') : t('discardDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
