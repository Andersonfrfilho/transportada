/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useBillingWorkspace } from '../hooks/useBillingWorkspace.hook'
import { createBillingDocumentDownloadController } from '../shared/billingDocumentDownload.service'
import { createBillingDrafts } from '../shared/billingDraft.service'
import type { BillingEligibleFilters } from '../shared/billingClient.service'
import { createBillingViewModel } from '../shared/billingViewModel.service'

const FILTER_FIELDS: readonly (keyof Omit<BillingEligibleFilters, 'limit'>)[] = [
  'batchId',
  'cteNumber',
  'customerDocument',
  'issuedFrom',
  'issuedTo',
  'minAmount',
  'maxAmount',
]

function sumSelectedAmount(
  selectedIds: readonly string[],
  items: readonly { cteId: string; totalAmount: string }[],
): string {
  const total = items
    .filter((item) => selectedIds.includes(item.cteId))
    .reduce((amount, item) => amount + BigInt(item.totalAmount.replace('.', '')), 0n)
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`
}

export function BillingWorkspacePage() {
  const { t } = useTranslation('billingWorkspace')
  const authQuery = useAuthMeQuery()
  const drafts = createBillingDrafts()
  const [filters, setFilters] = useState<Partial<Omit<BillingEligibleFilters, 'limit'>>>({})
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useBillingWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    eligibleFilters: filters,
    permissions,
    ...(selectedInvoiceId === '' ? {} : { selectedInvoiceId }),
  })
  const status =
    authQuery.isError ||
    workspace.eligibleQuery.isError ||
    workspace.invoiceQuery.isError ||
    workspace.documentsQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (workspace.controller.canReadBilling &&
            (workspace.eligibleQuery.isLoading ||
              workspace.invoiceQuery.isLoading ||
              workspace.documentsQuery.isLoading))
        ? 'loading'
        : 'success'
  const viewModel = createBillingViewModel({
    permissions,
    status,
    ...(workspace.documentsQuery.data === undefined
      ? {}
      : { documents: workspace.documentsQuery.data }),
    ...(workspace.eligibleQuery.data === undefined
      ? {}
      : { eligible: workspace.eligibleQuery.data }),
    ...(workspace.invoiceQuery.data === undefined ? {} : { invoice: workspace.invoiceQuery.data }),
  })
  const downloadController = createBillingDocumentDownloadController({
    openUrl: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
  })
  const eligibleItems = workspace.eligibleQuery.data?.items ?? []
  const totalSelectedAmount = sumSelectedAmount(selectedIds, eligibleItems)

  function updateFilter(key: keyof Omit<BillingEligibleFilters, 'limit'>, value: string): void {
    setFilters((current) => ({ ...current, [key]: value.trim() === '' ? undefined : value }))
  }

  async function handleCreateInvoice(): Promise<void> {
    const draft = drafts.createInvoiceDraft({ cteIds: selectedIds, dueDate })
    const invoice = await workspace.createMutation.mutateAsync(draft)
    setSelectedIds([])
    setSelectedInvoiceId(invoice.id)
  }

  async function handleCancelInvoice(): Promise<void> {
    const draft = drafts.createCancelDraft({ invoiceId: selectedInvoiceId, reason: cancelReason })
    const invoice = await workspace.cancelMutation.mutateAsync(draft)
    setCancelReason('')
    setSelectedInvoiceId(invoice.id)
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-hero">
        <div>
          <p className="workspace-kicker">Fechamento financeiro</p>
          <h1>{t('title')}</h1>
          <p className="workspace-intro">
            Selecione CT-e elegiveis, gere a fatura e acompanhe os documentos financeiros do lote.
          </p>
        </div>
        <div className="workspace-status-card">
          <span>Estado atual</span>
          <strong>{viewModel.status}</strong>
          <p className="workspace-status-text">
            {t('eligible.summary', { count: selectedIds.length, total: totalSelectedAmount })}
          </p>
        </div>
      </header>
      <p
        className={
          viewModel.status === 'error' || viewModel.status === 'forbidden'
            ? 'workspace-boundary'
            : 'workspace-status-text'
        }
        role={viewModel.status === 'error' || viewModel.status === 'forbidden' ? 'alert' : 'status'}
      >
        {t(`status.${viewModel.status}`)}
      </p>
      {viewModel.status === 'forbidden' ? null : (
        <div className="workspace-grid">
          <section className="workspace-panel">
            <h2>{t('filters.title')}</h2>
            <div className="workspace-filter-grid">
              {FILTER_FIELDS.map((field) => (
                <label key={field}>
                  <span>{t(`filters.${field}`)}</span>
                  <input
                    onChange={(event) => updateFilter(field, event.target.value)}
                    type="text"
                    value={filters[field] ?? ''}
                  />
                </label>
              ))}
            </div>
            <div className="workspace-actions">
              <button
                className="workspace-secondary-action"
                onClick={() => setFilters({})}
                type="button"
              >
                {t('filters.clear')}
              </button>
            </div>
          </section>
          <section className="workspace-panel workspace-panel-full">
            <h2>{t('eligible.title')}</h2>
            <p>
              {t('eligible.summary', { count: selectedIds.length, total: totalSelectedAmount })}
            </p>
            {eligibleItems.length === 0 ? (
              <p>{t('eligible.empty')}</p>
            ) : (
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>{t('eligible.select')}</th>
                      <th>{t('eligible.cteNumber')}</th>
                      <th>{t('eligible.customer')}</th>
                      <th>{t('eligible.totalAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleItems.map((item) => (
                      <tr key={item.cteId}>
                        <td>
                          <input
                            checked={selectedIds.includes(item.cteId)}
                            disabled={!viewModel.canCreateBilling}
                            onChange={(event) =>
                              setSelectedIds((current) =>
                                event.target.checked
                                  ? drafts.createSelectionDraft({
                                      selectedIds: [...current, item.cteId],
                                    }).selectedIds
                                  : current.filter((id) => id !== item.cteId),
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td>{item.cteNumber}</td>
                        <td>{item.customerName}</td>
                        <td>{item.totalAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="workspace-panel">
            <h2>{t('create.title')}</h2>
            <label>
              <span>{t('create.dueDate')}</span>
              <input
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </label>
            <button
              className="workspace-primary-action"
              disabled={!viewModel.canCreateBilling || selectedIds.length === 0 || dueDate === ''}
              onClick={() => void handleCreateInvoice()}
              type="button"
            >
              {t('create.submit')}
            </button>
          </section>
          <section className="workspace-panel">
            <h2>{t('invoice.title')}</h2>
            <label>
              <span>{t('invoice.lookup')}</span>
              <input
                onChange={(event) => setSelectedInvoiceId(event.target.value)}
                type="text"
                value={selectedInvoiceId}
              />
            </label>
            {workspace.invoiceQuery.data === undefined ? (
              <p>{t('invoice.empty')}</p>
            ) : (
              <>
                <p>{t('invoice.number', { value: workspace.invoiceQuery.data.invoiceNumber })}</p>
                <p>{t('invoice.customer', { value: workspace.invoiceQuery.data.customer.name })}</p>
                <p>{t('invoice.total', { value: workspace.invoiceQuery.data.totalAmount })}</p>
                <p>{t('invoice.statusValue', { value: workspace.invoiceQuery.data.status })}</p>
              </>
            )}
            <label>
              <span>{t('cancel.reason')}</span>
              <input
                onChange={(event) => setCancelReason(event.target.value)}
                type="text"
                value={cancelReason}
              />
            </label>
            <button
              className="workspace-secondary-action"
              disabled={
                !viewModel.canCancelBilling ||
                selectedInvoiceId === '' ||
                cancelReason.trim().length < 3
              }
              onClick={() => void handleCancelInvoice()}
              type="button"
            >
              {t('cancel.submit')}
            </button>
          </section>
          <section className="workspace-panel">
            <h2>{t('documents.title')}</h2>
            {(workspace.documentsQuery.data?.items ?? []).length === 0 ? (
              <p>{t('documents.empty')}</p>
            ) : (
              <ul className="workspace-list">
                {workspace.documentsQuery.data?.items.map((document) => (
                  <li key={document.documentId}>
                    <strong>{document.documentType}</strong>
                    <button
                      className="workspace-secondary-action"
                      disabled={!viewModel.canDownloadBillingDocument}
                      onClick={() => downloadController.openDocument(document)}
                      type="button"
                    >
                      {t('documents.download')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
