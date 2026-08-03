/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { BillingInvoiceDetail } from '../components/BillingInvoiceDetail.component'
import { useBillingWorkspace } from '../hooks/useBillingWorkspace.hook'
import { navigateToBillingInvoices } from '../shared/billingInvoiceRoute.service'
import { createBillingViewModel } from '../shared/billingViewModel.service'

type BillingInvoiceDetailPageProps = Readonly<{ invoiceId: string }>

export function BillingInvoiceDetailPage({ invoiceId }: BillingInvoiceDetailPageProps) {
  const { t } = useTranslation('billingWorkspace')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useBillingWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    invoiceId,
    permissions,
  })
  const status =
    authQuery.isError || workspace.invoiceQuery.isError || workspace.documentsQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (workspace.controller.canReadBilling &&
            (workspace.invoiceQuery.isLoading || workspace.documentsQuery.isLoading))
        ? 'loading'
        : 'success'
  const viewModel = createBillingViewModel({
    permissions,
    status,
    ...(workspace.documentsQuery.data === undefined
      ? {}
      : { documents: workspace.documentsQuery.data }),
    ...(workspace.invoiceQuery.data === undefined ? {} : { invoice: workspace.invoiceQuery.data }),
  })

  function handleBackToInvoices(): void {
    navigateToBillingInvoices(createBrowserWorkspaceNavigator())
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-hero">
        <div>
          <p className="workspace-kicker">{t('invoiceDetail.pageKicker')}</p>
          <h1>{t('invoiceDetail.title')}</h1>
          <p className="workspace-intro">{t('invoiceDetail.pageIntro')}</p>
        </div>
        <div className="workspace-status-card">
          <span>{t('invoiceDetail.statusValue')}</span>
          <strong>{viewModel.status}</strong>
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
          <section className="workspace-panel workspace-panel-full">
            <BillingInvoiceDetail onClose={handleBackToInvoices} workspace={workspace} />
          </section>
        </div>
      )}
    </main>
  )
}
