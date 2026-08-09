/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { BillingEligibleTable } from '../components/BillingEligibleTable.component'
import { BillingInvoiceTable } from '../components/BillingInvoiceTable.component'
import { DueDateField } from '../components/DueDateField.component'
import { useBillingEligibleTable } from '../hooks/useBillingEligibleTable.hook'
import { useBillingInvoiceTable } from '../hooks/useBillingInvoiceTable.hook'
import { useBillingWorkspace } from '../hooks/useBillingWorkspace.hook'
import { createBillingDrafts } from '../shared/billingDraft.service'
import { navigateToBillingInvoice } from '../shared/billingInvoiceRoute.service'
import { createBillingViewModel } from '../shared/billingViewModel.service'

export function BillingWorkspacePage() {
  const { t } = useTranslation('billingWorkspace')
  const authQuery = useAuthMeQuery()
  const drafts = createBillingDrafts()
  const [dueDate, setDueDate] = useState('')
  const [activeTab, setActiveTab] = useState<'create' | 'invoices'>('create')
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const eligibleTable = useBillingEligibleTable({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const invoiceTable = useBillingInvoiceTable({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const workspace = useBillingWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const status =
    authQuery.isError || eligibleTable.eligibleQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (workspace.controller.canReadBilling && eligibleTable.eligibleQuery.isLoading)
        ? 'loading'
        : 'success'
  const viewModel = createBillingViewModel({
    permissions,
    status,
    ...(eligibleTable.eligibleQuery.data === undefined
      ? {}
      : { eligible: eligibleTable.eligibleQuery.data }),
  })

  async function handleCreateInvoice(): Promise<void> {
    const draft = drafts.createInvoiceDraft({ cteIds: eligibleTable.selectedIds, dueDate })
    const invoice = await workspace.createMutation.mutateAsync(draft)
    eligibleTable.clearSelection()
    navigateToBillingInvoice({
      invoiceId: invoice.id,
      navigator: createBrowserWorkspaceNavigator(),
    })
  }

  const tabs: readonly TabsItem[] = [
    {
      id: 'create',
      label: t('tabs.create'),
      panel:
        viewModel.status === 'forbidden' ? null : (
          <div className="workspace-grid">
            <section className="workspace-panel workspace-panel-full">
              <BillingEligibleTable table={eligibleTable} />
            </section>
            <section className="workspace-panel workspace-panel-full">
              <h2>{t('create.title')}</h2>
              <p className="workspace-status-text">
                {t('create.selectionSummary', {
                  count: eligibleTable.selection.count,
                  total: formatAmount(eligibleTable.selection.totalAmount),
                })}
              </p>
              <DueDateField onChange={setDueDate} value={dueDate} />
              <button
                className="workspace-primary-action"
                disabled={
                  !viewModel.canCreateBilling ||
                  eligibleTable.selection.count === 0 ||
                  eligibleTable.selection.customerDocuments.length > 1 ||
                  dueDate === ''
                }
                onClick={() => void handleCreateInvoice()}
                type="button"
              >
                <Icon name="invoice" />
                {t('create.submit')}
              </button>
            </section>
          </div>
        ),
    },
    {
      id: 'invoices',
      label: t('tabs.invoices'),
      panel: (
        <div className="workspace-grid">
          <section className="workspace-panel workspace-panel-full">
            <BillingInvoiceTable table={invoiceTable} />
          </section>
        </div>
      ),
    },
  ]

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
            {t('create.selectionSummary', {
              count: eligibleTable.selection.count,
              total: formatAmount(eligibleTable.selection.totalAmount),
            })}
          </p>
        </div>
      </header>
      {viewModel.status === 'loading' ? (
        <SkeletonGroup className="workspace-status-text" label={t('status.loading')}>
          <Skeleton variant="text" width="18rem" />
        </SkeletonGroup>
      ) : (
        <p
          className={
            viewModel.status === 'error' || viewModel.status === 'forbidden'
              ? 'workspace-boundary'
              : 'workspace-status-text'
          }
          role={
            viewModel.status === 'error' || viewModel.status === 'forbidden' ? 'alert' : 'status'
          }
        >
          {t(`status.${viewModel.status}`)}
        </p>
      )}
      <Tabs
        ariaLabel={t('title')}
        items={tabs}
        onChange={(id) => setActiveTab(id === 'invoices' ? 'invoices' : 'create')}
        value={activeTab}
      />
    </main>
  )
}
