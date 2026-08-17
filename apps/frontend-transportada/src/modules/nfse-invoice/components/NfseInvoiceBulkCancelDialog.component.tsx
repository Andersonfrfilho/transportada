/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceBulkCancelController } from '../hooks/useNfseInvoiceBulkCancel.hook'
import {
  NFSE_CANCELLATION_MOTIVES,
  NFSE_CANCELLATION_REASON_MAX_LENGTH,
  type NfseCancellationMotive,
} from '../shared/nfseInvoice.constant'
import { countNfseBulkCancelBlocks } from '../shared/nfseInvoiceBulkCancel.service'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceBulkCancelDialogProps = Readonly<{
  bulkCancel: NfseInvoiceBulkCancelController
}>

export function NfseInvoiceBulkCancelDialog({
  bulkCancel,
}: NfseInvoiceBulkCancelDialogProps): JSX.Element | null {
  const { t } = useTranslation('nfseInvoice')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: bulkCancel.isOpen,
    onClose: bulkCancel.close,
  })

  if (!bulkCancel.isOpen) return null

  const eligibleCount = bulkCancel.plan.eligible.length
  const blocks = countNfseBulkCancelBlocks(bulkCancel.plan.blocked)

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-bulk-cancel-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-bulk-cancel-title">{t('bulkCancel.title')}</h2>
            <p className={styles.emissionHint}>
              {t('bulkCancel.subtitle', { count: eligibleCount })}
            </p>
          </div>
          <button
            aria-label={t('bulkCancel.close')}
            className={styles.iconAction}
            onClick={bulkCancel.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.emissionHint}>{t('cancelDialog.warning')}</p>

        {blocks.length > 0 && (
          <section>
            <h3>{t('bulkCancel.blocked')}</h3>
            <ul className={styles.emissionHint}>
              {blocks.map((block) => (
                <li key={block.reason}>
                  {t(`feedback.${block.reason}`)} ({block.count})
                </li>
              ))}
            </ul>
          </section>
        )}

        {eligibleCount === 0 ? (
          <p className={styles.placeholder}>{t('bulkCancel.empty')}</p>
        ) : (
          <div className={styles.emissionForm}>
            <label className={styles.emissionField}>
              <span>{t('cancelDialog.motive')}</span>
              <Select
                ariaLabel={t('cancelDialog.motive')}
                disabled={bulkCancel.isPending}
                onChange={(value) =>
                  bulkCancel.setCancellationMotive(value as NfseCancellationMotive)
                }
                options={NFSE_CANCELLATION_MOTIVES.map((motive) => ({
                  label: t(`cancelDialog.motives.${motive}`),
                  value: motive,
                }))}
                placeholder={t('cancelDialog.motivePlaceholder')}
                value={bulkCancel.cancellationMotive}
              />
              <span className={styles.emissionHint}>{t('bulkCancel.motiveHint')}</span>
            </label>

            <label className={styles.emissionField}>
              <span>{t('cancelDialog.reason')}</span>
              <textarea
                disabled={bulkCancel.isPending}
                maxLength={NFSE_CANCELLATION_REASON_MAX_LENGTH}
                onChange={(event) => bulkCancel.setCancellationReason(event.target.value)}
                rows={3}
                value={bulkCancel.cancellationReason}
              />
              <span className={styles.emissionHint}>{t('bulkCancel.reasonHint')}</span>
            </label>
          </div>
        )}

        {bulkCancel.reasonBlock !== null && bulkCancel.cancellationReason !== '' && (
          <p className={styles.placeholder} role="alert">
            {t(`cancelDialog.${bulkCancel.reasonBlock}`)}
          </p>
        )}
        {bulkCancel.summary !== null && (
          <p className={styles.emissionHint} role="status">
            {t('bulkCancel.result', {
              cancelled: bulkCancel.summary.cancelled,
              failed: bulkCancel.summary.failed,
            })}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={bulkCancel.close} type="button">
            <Icon name="close" />
            {t('cancelDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={eligibleCount === 0 || !bulkCancel.isCancelReady || bulkCancel.isPending}
            onClick={bulkCancel.confirm}
            type="button"
          >
            <Icon name="trash" />
            {bulkCancel.isPending ? t('cancelDialog.sending') : t('bulkCancel.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
