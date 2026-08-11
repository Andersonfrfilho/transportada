/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ProgressBar } from '@/components/ui/progress'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { BillingBulkCancelController } from '../hooks/useBillingBulkCancel.hook'
import type { BillingCancelOutcome } from '../shared/billingBulkCancel.service'
import styles from '../styles/billingBulkCancel.module.css'

type BillingBulkCancelDialogProps = Readonly<{
  dialog: BillingBulkCancelController
}>

export function BillingBulkCancelDialog({ dialog }: BillingBulkCancelDialogProps) {
  const { t } = useTranslation('billingWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen) return null

  const hasResult = dialog.outcomes.length > 0
  const isFinished = dialog.progress.isComplete && !dialog.isSubmitting

  function renderOutcome(outcome: BillingCancelOutcome) {
    const hasFailed = outcome.errorCode !== undefined
    return (
      <li
        className={hasFailed ? styles.outcomeFailed : styles.outcomeCancelled}
        key={outcome.invoiceId}
      >
        {hasFailed
          ? t('invoices.bulkCancel.outcomeFailed', {
              code: outcome.errorCode,
              number: outcome.invoiceNumber,
            })
          : t('invoices.bulkCancel.outcomeCancelled', { number: outcome.invoiceNumber })}
      </li>
    )
  }

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página como bloco
  // de contenção, e o `position: fixed` deixaria de se referir à viewport.
  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="billing-bulk-cancel-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <h2 id="billing-bulk-cancel-title">{t('invoices.bulkCancel.title')}</h2>
            <p className={styles.subtitle}>{t('invoices.bulkCancel.subtitle')}</p>
          </div>
          <button
            aria-label={t('invoices.bulkCancel.close')}
            className={styles.iconAction}
            onClick={dialog.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <section className={styles.section}>
          <p className={styles.warning} role="alert">
            {t('invoices.bulkCancel.warning', { count: dialog.cancellable.length })}
          </p>
          <ul className={styles.list}>
            {dialog.cancellable.map((invoice) => (
              <li key={invoice.id}>
                {t('invoices.bulkCancel.invoiceLine', {
                  customer: invoice.customer.name,
                  number: invoice.invoiceNumber,
                })}
              </li>
            ))}
          </ul>
          {dialog.alreadyCancelledCount === 0 ? null : (
            <p className={styles.hint}>
              {t('invoices.bulkCancel.alreadyCancelled', { count: dialog.alreadyCancelledCount })}
            </p>
          )}
        </section>

        <label className={styles.field}>
          <span>{t('invoices.bulkCancel.reason')}</span>
          <textarea
            disabled={dialog.isSubmitting || isFinished}
            onChange={(event) => dialog.setReason(event.target.value)}
            value={dialog.reason}
          />
        </label>
        {dialog.reasonError === null ? null : (
          <p className={styles.warning} role="alert">
            {t(`invoices.bulkCancel.reasonError.${dialog.reasonError}`)}
          </p>
        )}

        {dialog.isSubmitting || hasResult ? (
          <section className={styles.section}>
            <ProgressBar
              completed={dialog.progress.successCount + dialog.progress.errorCount}
              label={t('invoices.bulkCancel.progressLabel')}
              total={dialog.progress.total}
              valueText={t('invoices.bulkCancel.progressValue', {
                completed: dialog.progress.successCount + dialog.progress.errorCount,
                percent: dialog.progress.percent,
                total: dialog.progress.total,
              })}
            />
            <p className={styles.summaryLine}>
              {t('invoices.bulkCancel.progressSummary', {
                errorCount: dialog.progress.errorCount,
                successCount: dialog.progress.successCount,
              })}
            </p>
          </section>
        ) : null}

        {hasResult ? (
          <ul aria-live="polite" className={styles.list}>
            {dialog.outcomes.map(renderOutcome)}
          </ul>
        ) : null}

        <footer className={styles.footer}>
          <Button onClick={dialog.close} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {isFinished ? t('invoices.bulkCancel.done') : t('invoices.bulkCancel.dismiss')}
          </Button>
          {isFinished ? null : (
            <Button
              disabled={dialog.isSubmitting || dialog.cancellable.length === 0}
              onClick={dialog.confirm}
              size="sm"
              type="button"
            >
              <Icon name="alert" />
              {dialog.isSubmitting
                ? t('invoices.bulkCancel.submitting')
                : t('invoices.bulkCancel.confirm')}
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
