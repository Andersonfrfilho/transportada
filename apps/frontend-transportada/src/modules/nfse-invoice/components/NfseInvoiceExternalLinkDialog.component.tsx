/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceExternalLinkDialogProps = Readonly<{
  actions: NfseInvoiceRowActionsController
}>

const PROVIDER_DOCUMENT_ID_MAX_LENGTH = 20
const ALREADY_LINKED_ERROR_CODE = 'NFSE_PROVIDER_DOCUMENT_ALREADY_LINKED'

export function NfseInvoiceExternalLinkDialog({ actions }: NfseInvoiceExternalLinkDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const isOpen = actions.externalLinkTarget !== null
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen,
    onClose: actions.closeExternalLink,
  })

  if (actions.externalLinkTarget === null) return null

  const invoice = actions.externalLinkTarget
  const isInputInvalid = actions.providerDocumentId.trim() !== '' && !actions.isExternalLinkReady
  const errorKey =
    actions.externalLinkErrorCode === ALREADY_LINKED_ERROR_CODE
      ? 'externalLinkDialog.alreadyLinked'
      : 'externalLinkDialog.failed'

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-external-link-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-external-link-title">{t('externalLinkDialog.title')}</h2>
            <p className={styles.emissionHint}>
              {invoice.takerLegalName} · {formatAmount(invoice.serviceAmount)}
            </p>
          </div>
          <button
            aria-label={t('externalLinkDialog.close')}
            className={styles.iconAction}
            onClick={actions.closeExternalLink}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.emissionHint}>{t('externalLinkDialog.description')}</p>

        <div className={styles.emissionForm}>
          <label className={styles.emissionField}>
            <span>{t('externalLinkDialog.providerDocumentId')}</span>
            <input
              aria-invalid={isInputInvalid}
              disabled={actions.isExternalLinkPending}
              inputMode="numeric"
              maxLength={PROVIDER_DOCUMENT_ID_MAX_LENGTH}
              onChange={(event) => actions.setProviderDocumentId(event.target.value)}
              value={actions.providerDocumentId}
            />
          </label>
        </div>

        {isInputInvalid && (
          <p className={styles.placeholder} role="alert">
            {t('externalLinkDialog.providerDocumentIdInvalid')}
          </p>
        )}

        {actions.externalLinkErrorCode !== null && (
          <p className={styles.placeholder} role="alert">
            {t(errorKey)}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={actions.closeExternalLink} type="button">
            <Icon name="close" />
            {t('externalLinkDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={actions.isExternalLinkPending || !actions.isExternalLinkReady}
            onClick={actions.confirmExternalLink}
            type="button"
          >
            <Icon name="link" />
            {actions.isExternalLinkPending
              ? t('externalLinkDialog.sending')
              : t('externalLinkDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
