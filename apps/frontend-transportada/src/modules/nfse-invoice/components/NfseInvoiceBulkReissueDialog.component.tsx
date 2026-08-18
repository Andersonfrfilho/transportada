/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceBulkReissueController } from '../hooks/useNfseInvoiceBulkReissue.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceBulkReissueDialogProps = Readonly<{
  bulkReissue: NfseInvoiceBulkReissueController
}>

export function NfseInvoiceBulkReissueDialog({
  bulkReissue,
}: NfseInvoiceBulkReissueDialogProps): JSX.Element | null {
  const { t } = useTranslation('nfseInvoice')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: bulkReissue.isOpen,
    onClose: bulkReissue.close,
  })

  if (!bulkReissue.isOpen) return null

  const eligibleCount = bulkReissue.plan.eligible.length
  const blockedCount = bulkReissue.plan.blocked.length

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-bulk-reissue-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-bulk-reissue-title">{t('bulkReissue.title')}</h2>
            <p className={styles.emissionHint}>
              {t('bulkReissue.subtitle', { count: eligibleCount })}
            </p>
          </div>
          <button
            aria-label={t('bulkReissue.close')}
            className={styles.iconAction}
            onClick={bulkReissue.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {blockedCount > 0 && (
          <p className={styles.emissionHint}>
            {t('bulkReissue.blocked', { count: blockedCount })}
          </p>
        )}

        {eligibleCount === 0 ? (
          <p className={styles.placeholder}>{t('bulkReissue.empty')}</p>
        ) : (
          <p className={styles.emissionHint}>{t('bulkReissue.confirmation')}</p>
        )}

        {bulkReissue.summary !== null && (
          <p className={styles.emissionHint} role="status">
            {t('bulkReissue.result', {
              failed: bulkReissue.summary.failed,
              reissued: bulkReissue.summary.reissued,
            })}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={bulkReissue.close} type="button">
            <Icon name="close" />
            {t('reissueDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={eligibleCount === 0 || bulkReissue.isPending}
            onClick={bulkReissue.confirm}
            type="button"
          >
            <Icon name="refresh" />
            {bulkReissue.isPending ? t('reissueDialog.sending') : t('bulkReissue.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
