/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import {
  NFSE_CANCELLATION_MOTIVES,
  NFSE_CANCELLATION_REASON_MAX_LENGTH,
  type NfseCancellationMotive,
} from '../shared/nfseInvoice.constant'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceCancelDialogProps = Readonly<{
  actions: NfseInvoiceRowActionsController
}>

export function NfseInvoiceCancelDialog({ actions }: NfseInvoiceCancelDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const isOpen = actions.cancelTarget !== null
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: actions.closeCancel })

  if (actions.cancelTarget === null) return null

  const invoice = actions.cancelTarget

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-cancel-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-cancel-title">{t('cancelDialog.title')}</h2>
            <p className={styles.emissionHint}>
              {invoice.takerLegalName} · {formatAmount(invoice.serviceAmount)}
            </p>
          </div>
          <button
            aria-label={t('cancelDialog.close')}
            className={styles.iconAction}
            onClick={actions.closeCancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.emissionHint}>{t('cancelDialog.warning')}</p>

        <div className={styles.emissionForm}>
          <label className={styles.emissionField}>
            <span>{t('cancelDialog.motive')}</span>
            <Select
              ariaLabel={t('cancelDialog.motive')}
              disabled={actions.isCancelPending}
              onChange={(value) => actions.setCancellationMotive(value as NfseCancellationMotive)}
              options={NFSE_CANCELLATION_MOTIVES.map((motive) => ({
                label: t(`cancelDialog.motives.${motive}`),
                value: motive,
              }))}
              placeholder={t('cancelDialog.motivePlaceholder')}
              value={actions.cancellationMotive}
            />
            <span className={styles.emissionHint}>{t('cancelDialog.motiveHint')}</span>
          </label>

          <label className={styles.emissionField}>
            <span>{t('cancelDialog.reason')}</span>
            <textarea
              disabled={actions.isCancelPending}
              maxLength={NFSE_CANCELLATION_REASON_MAX_LENGTH}
              onChange={(event) => actions.setCancellationReason(event.target.value)}
              rows={3}
              value={actions.cancellationReason}
            />
            <span className={styles.emissionHint}>{t('cancelDialog.reasonHint')}</span>
          </label>
        </div>

        {actions.reasonBlock !== null && actions.cancellationReason !== '' && (
          <p className={styles.placeholder} role="alert">
            {t(`cancelDialog.${actions.reasonBlock}`)}
          </p>
        )}
        {actions.cancelErrorCode !== null && (
          <p className={styles.placeholder} role="alert">
            {t('cancelDialog.failed')}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={actions.closeCancel} type="button">
            <Icon name="close" />
            {t('cancelDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={!actions.isCancelReady || actions.isCancelPending}
            onClick={actions.confirmCancel}
            type="button"
          >
            <Icon name="trash" />
            {actions.isCancelPending ? t('cancelDialog.sending') : t('cancelDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
