/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { useBillingWorkspace } from '../hooks/useBillingWorkspace.hook'
import { createBillingDocumentDownloadController } from '../shared/billingDocumentDownload.service'
import { createBillingDrafts } from '../shared/billingDraft.service'
import { resolveBillingCancellationState } from '../shared/billingInvoiceDetail.service'
import {
  BILLING_OBSERVATIONS_MAX_LENGTH,
  resolveBillingInvoiceEditState,
} from '../shared/billingInvoiceEdit.service'
import styles from '../styles/billingInvoiceDetail.module.css'

type BillingInvoiceDetailProps = {
  onClose: () => void
  workspace: ReturnType<typeof useBillingWorkspace>
}

type BillingEditValues = {
  discountAmount: string
  observations: string
  surchargeAmount: string
}

type BillingEditDraft = {
  invoiceId: string
  values: BillingEditValues
}

const documentDownload = createBillingDocumentDownloadController({
  openUrl: (url) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  },
})

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleDateString()
}

export function BillingInvoiceDetail({ onClose, workspace }: BillingInvoiceDetailProps) {
  const { t } = useTranslation('billingWorkspace')
  const [cancelReason, setCancelReason] = useState('')
  /** O rascunho guarda o id: trocar de fatura volta sozinho para os valores gravados. */
  const [editDraft, setEditDraft] = useState<BillingEditDraft | null>(null)
  const drafts = createBillingDrafts()
  const invoice = workspace.invoiceQuery.data
  const documents = workspace.documentsQuery.data?.items ?? []
  const cancellation = resolveBillingCancellationState({
    canCancel: workspace.controller.canCancelBilling,
    invoiceStatus: invoice?.status ?? '',
    isPending: workspace.cancelMutation.isPending,
    reason: cancelReason,
  })
  const editValues =
    editDraft !== null && editDraft.invoiceId === invoice?.id
      ? editDraft.values
      : {
          discountAmount: invoice?.discountAmount ?? '',
          observations: invoice?.observations ?? '',
          surchargeAmount: invoice?.surchargeAmount ?? '',
        }
  const edition = resolveBillingInvoiceEditState({
    canEdit: workspace.controller.canCreateBilling,
    discountAmount: editValues.discountAmount,
    invoiceStatus: invoice?.status ?? '',
    isPending: workspace.updateMutation.isPending,
    observations: editValues.observations,
    subtotalAmount: invoice?.subtotalAmount ?? '0.00',
    surchargeAmount: editValues.surchargeAmount,
  })

  async function handleCancelInvoice(): Promise<void> {
    if (invoice === undefined) return
    const draft = drafts.createCancelDraft({ invoiceId: invoice.id, reason: cancelReason })
    await workspace.cancelMutation.mutateAsync(draft)
    setCancelReason('')
  }

  function handleEditChange(field: keyof BillingEditValues, value: string): void {
    if (invoice === undefined) return
    setEditDraft({ invoiceId: invoice.id, values: { ...editValues, [field]: value } })
  }

  async function handleUpdateInvoice(): Promise<void> {
    if (invoice === undefined) return
    const draft = drafts.createEditDraft({
      discountAmount: editValues.discountAmount,
      invoiceId: invoice.id,
      observations: editValues.observations,
      surchargeAmount: editValues.surchargeAmount,
    })
    await workspace.updateMutation.mutateAsync(draft)
    setEditDraft(null)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{t('invoiceDetail.title')}</h2>
        <button className={styles.action} onClick={onClose} type="button">
          <Icon name="chevron-left" />
          {t('invoiceDetail.close')}
        </button>
      </div>
      {invoice === undefined ? (
        <p className={styles.hint}>{t('invoiceDetail.empty')}</p>
      ) : (
        <>
          <div className={styles.summaryGrid}>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.number')}</span>
              <span className={styles.summaryValue}>{invoice.invoiceNumber}</span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.statusValue')}</span>
              <span
                className={
                  invoice.status === 'issued'
                    ? `${styles.statusBadge} ${styles.statusReady}`
                    : `${styles.statusBadge} ${styles.statusAlert}`
                }
              >
                {t(`invoices.statusOptions.${invoice.status}`)}
              </span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.customer')}</span>
              <span className={styles.summaryValue}>{invoice.customer.name}</span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.document')}</span>
              <span className={styles.summaryValue}>{invoice.customer.document}</span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.issuedAt')}</span>
              <span className={styles.summaryValue}>{formatMoment(invoice.issuedAt)}</span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.dueDate')}</span>
              <span className={styles.summaryValue}>{formatCalendarDate(invoice.dueDate)}</span>
            </span>
            <span className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{t('invoiceDetail.total')}</span>
              <span className={`${styles.summaryValue} ${styles.amountValue}`}>
                {formatAmount(invoice.totalAmount)}
              </span>
            </span>
          </div>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('invoiceDetail.itemsTitle')}</h3>
            {invoice.items.length === 0 ? (
              <p className={styles.hint}>{t('invoiceDetail.itemsEmpty')}</p>
            ) : (
              <div className={styles.itemsScroll}>
                <table className={styles.itemsTable}>
                  <thead>
                    <tr>
                      <th scope="col">{t('invoiceDetail.itemsNumber')}</th>
                      <th scope="col">{t('invoiceDetail.itemsDescription')}</th>
                      <th scope="col">{t('invoiceDetail.itemsAccessKey')}</th>
                      <th scope="col">{t('invoiceDetail.itemsAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.accessKey}>
                        <td>{item.cteNumber}</td>
                        <td>{item.description}</td>
                        <td className={styles.accessKeyCell}>{item.accessKey}</td>
                        <td className={styles.amountValue}>{formatAmount(item.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('invoiceDetail.editTitle')}</h3>
            <div className={styles.editGrid}>
              <label className={styles.editField}>
                <span>{t('invoiceDetail.editDiscount')}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => handleEditChange('discountAmount', event.target.value)}
                  type="text"
                  value={editValues.discountAmount}
                />
              </label>
              <label className={styles.editField}>
                <span>{t('invoiceDetail.editSurcharge')}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => handleEditChange('surchargeAmount', event.target.value)}
                  type="text"
                  value={editValues.surchargeAmount}
                />
              </label>
              <span className={styles.editField}>
                <span>{t('invoiceDetail.editTotalPreview')}</span>
                <span className={`${styles.editTotal} ${styles.amountValue}`}>
                  {edition.totalAmount === null ? '—' : formatAmount(edition.totalAmount)}
                </span>
              </span>
            </div>
            <label className={styles.editField}>
              <span>{t('invoiceDetail.editObservations')}</span>
              <textarea
                maxLength={BILLING_OBSERVATIONS_MAX_LENGTH}
                onChange={(event) => handleEditChange('observations', event.target.value)}
                rows={3}
                value={editValues.observations}
              />
            </label>
            <div className={styles.editActions}>
              <button
                className={styles.action}
                disabled={edition.isDisabled}
                onClick={() => void handleUpdateInvoice()}
                type="button"
              >
                <Icon name="save" />
                {t('invoiceDetail.editSubmit')}
              </button>
              {edition.messageKey === null ? null : (
                <p className={styles.hint}>{t(edition.messageKey)}</p>
              )}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>{t('invoiceDetail.documentsTitle')}</h3>
              <button
                className={styles.action}
                disabled={
                  !workspace.controller.canCreateBilling ||
                  workspace.generateDocumentMutation.isPending
                }
                onClick={() => void workspace.generateDocumentMutation.mutateAsync()}
                type="button"
              >
                <Icon
                  name={workspace.generateDocumentMutation.isPending ? 'spinner' : 'document'}
                />
                {workspace.generateDocumentMutation.isPending
                  ? t('invoiceDetail.generatingDocument')
                  : t('invoiceDetail.generateDocument')}
              </button>
            </div>
            {workspace.generateDocumentMutation.isError ? (
              <p className={styles.hint} role="alert">
                {t('invoiceDetail.generateDocumentError')}
              </p>
            ) : null}
            {documents.length === 0 ? (
              <p className={styles.hint}>{t('invoiceDetail.documentsEmpty')}</p>
            ) : (
              <ul className={styles.documentList}>
                {documents.map((document) => (
                  <li className={styles.documentRow} key={document.documentId}>
                    <span className={styles.documentType}>{document.documentType}</span>
                    <button
                      className={styles.action}
                      onClick={() => documentDownload.openDocument(document)}
                      type="button"
                    >
                      <Icon name="download" />
                      {t('invoiceDetail.download')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('invoiceDetail.cancelTitle')}</h3>
            <div className={styles.cancelRow}>
              <label className={styles.cancelField}>
                <span>{t('invoiceDetail.cancelReason')}</span>
                <input
                  onChange={(event) => setCancelReason(event.target.value)}
                  type="text"
                  value={cancelReason}
                />
              </label>
              <button
                className={styles.action}
                disabled={cancellation.isDisabled}
                onClick={() => void handleCancelInvoice()}
                type="button"
              >
                <Icon name="alert" />
                {t('invoiceDetail.cancelSubmit')}
              </button>
            </div>
            {cancellation.messageKey === null ? null : (
              <p className={styles.hint}>{t(cancellation.messageKey)}</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
