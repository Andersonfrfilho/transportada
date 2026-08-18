/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceBulkDiscardController } from '../hooks/useNfseInvoiceBulkDiscard.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceBulkDiscardDialogProps = Readonly<{
  bulkDiscard: NfseInvoiceBulkDiscardController
}>

export function NfseInvoiceBulkDiscardDialog({
  bulkDiscard,
}: NfseInvoiceBulkDiscardDialogProps): JSX.Element | null {
  const { t } = useTranslation('nfseInvoice')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: bulkDiscard.isOpen,
    onClose: bulkDiscard.close,
  })

  if (!bulkDiscard.isOpen) return null

  const eligibleCount = bulkDiscard.plan.eligible.length
  const blockedCount = bulkDiscard.plan.blocked.length

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-bulk-discard-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-bulk-discard-title">{t('bulkDiscard.title')}</h2>
            <p className={styles.emissionHint}>
              {t('bulkDiscard.subtitle', { count: eligibleCount })}
            </p>
          </div>
          <button
            aria-label={t('bulkDiscard.close')}
            className={styles.iconAction}
            onClick={bulkDiscard.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {blockedCount > 0 && (
          <p className={styles.emissionHint}>{t('bulkDiscard.blocked', { count: blockedCount })}</p>
        )}

        {eligibleCount === 0 ? (
          <p className={styles.placeholder}>{t('bulkDiscard.empty')}</p>
        ) : (
          <p className={styles.emissionHint} role="alert">
            {t('bulkDiscard.warning')}
          </p>
        )}

        {bulkDiscard.summary !== null && (
          <p className={styles.emissionHint} role="status">
            {t('bulkDiscard.result', {
              discarded: bulkDiscard.summary.discarded,
              failed: bulkDiscard.summary.failed,
            })}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={bulkDiscard.close} type="button">
            <Icon name="close" />
            {t('discardDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={eligibleCount === 0 || bulkDiscard.isPending}
            onClick={bulkDiscard.confirm}
            type="button"
          >
            <Icon name="remove" />
            {bulkDiscard.isPending ? t('discardDialog.sending') : t('bulkDiscard.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
