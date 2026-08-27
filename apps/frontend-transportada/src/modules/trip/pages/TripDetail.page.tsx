/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { TripFinancialPanel } from '@/modules/trip-financials/components/TripFinancialPanel.component'
import { useTripFinancials } from '@/modules/trip-financials/hooks/useTripFinancials.hook'

import { TripDetail, TripDetailSkeleton } from '../components/TripDetail.component'
import { useTripDocumentLinkForm } from '../hooks/useTripDocumentLinkForm.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { navigateToTrips } from '../shared/tripRoute.service'
import styles from '../styles/trip.module.css'

type TripDetailPageProps = Readonly<{ tripId: string }>

export function TripDetailPage({ tripId }: TripDetailPageProps) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useTripWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
    tripId,
  })
  const linkForm = useTripDocumentLinkForm({
    findNfeDocumentByAccessKey: workspace.controller.findNfeDocumentByAccessKey,
    linkScannedDocument: ({ documentId }) =>
      workspace.linkDocumentMutation.mutateAsync({
        freightCalculationId: null,
        nfeDocumentId: documentId,
        tripId,
      }),
  })

  const financials = useTripFinancials({ permissions, tripId })

  function handleBackToTrips(): void {
    navigateToTrips(createBrowserWorkspaceNavigator())
  }

  return (
    <main className={styles.tripShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('detail.title')}</h1>
      </header>
      {authQuery.isLoading ? (
        <div className={styles.deck}>
          <TripDetailSkeleton />
        </div>
      ) : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}
      {authQuery.isSuccess ? (
        <div className={styles.deck}>
          <TripDetail linkForm={linkForm} onClose={handleBackToTrips} workspace={workspace} />
          {/*
            Spec 061 D4: o painel da conta só existe para quem tem `trip.financials`. Quem monta a
            viagem decide pela avaliação prevista, que não mostra o que se paga ao agregado.
          */}
          {financials.canReadFinancials ? (
            <TripFinancialPanel
              isLoading={financials.isLoading}
              onRecalculate={financials.recalculate}
              result={financials.result}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
