/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import type { NfseInvoice } from '../shared/nfseInvoice.types'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceRowActionsProps = Readonly<{
  actions: NfseInvoiceRowActionsController
  invoice: NfseInvoice
}>

export function NfseInvoiceRowActions({ actions, invoice }: NfseInvoiceRowActionsProps) {
  const { t } = useTranslation('nfseInvoice')
  const state = actions.resolveActions(invoice.status)

  return (
    <div className={styles.rowActions}>
      <button
        aria-label={t('rowActions.detail')}
        className={styles.iconAction}
        disabled={!state.isDetailEnabled}
        onClick={() => actions.openDetail(invoice)}
        title={t('rowActions.detail')}
        type="button"
      >
        <Icon name="eye" />
      </button>
      <button
        aria-label={t('rowActions.downloadXml')}
        className={styles.iconAction}
        disabled={!state.isDownloadEnabled}
        onClick={() => actions.downloadInvoice(invoice.id, 'xml')}
        title={t('rowActions.downloadXml')}
        type="button"
      >
        <Icon name="download" />
      </button>
      <button
        aria-label={t('rowActions.downloadPdf')}
        className={styles.iconAction}
        disabled={!state.isDownloadEnabled}
        onClick={() => actions.downloadInvoice(invoice.id, 'pdf')}
        title={t('rowActions.downloadPdf')}
        type="button"
      >
        <Icon name="document" />
      </button>
      {state.isCancelVisible && (
        <button
          aria-label={t('rowActions.cancel')}
          className={styles.iconAction}
          disabled={!state.isCancelEnabled}
          onClick={() => actions.openCancel(invoice)}
          title={t('rowActions.cancel')}
          type="button"
        >
          <Icon name="trash" />
        </button>
      )}
      {state.isReissueVisible && (
        <button
          aria-label={t('rowActions.reissue')}
          className={styles.iconAction}
          disabled={!state.isReissueEnabled}
          onClick={() => actions.openReissue(invoice)}
          title={t('rowActions.reissue')}
          type="button"
        >
          <Icon name="refresh" />
        </button>
      )}
      {state.isDiscardVisible && (
        <button
          aria-label={t('rowActions.discard')}
          className={styles.iconAction}
          disabled={!state.isDiscardEnabled}
          onClick={() => actions.openDiscard(invoice)}
          title={t('rowActions.discard')}
          type="button"
        >
          <Icon name="remove" />
        </button>
      )}
    </div>
  )
}
