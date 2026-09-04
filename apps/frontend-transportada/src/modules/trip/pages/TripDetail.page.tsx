/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
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
  /**
   * O detalhe imprimia o UUID do veículo. A frota já é carregada por esta app inteira, então a
   * identificação vem daqui em vez de a api passar a devolvê-la — o `useFleet` sem filtro
   * compartilha chave de consulta com a aba de veículos e não custa requisição nova.
   */
  const fleet = useFleet({ ...(companyId === undefined ? {} : { companyId }), permissions })
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
        {/*
          A saída da tela fica **no topo**. Ela vivia no fim da fileira de ações, depois de todas as
          paradas: numa viagem de quinze paradas era preciso rolar a tela inteira para voltar, e
          quem procurava o botão concluía que ele não existia.
        */}
        <div className={styles.headerBack}>
          <Button onClick={handleBackToTrips} size="sm" type="button" variant="ghost">
            <Icon name="chevron-left" />
            {t('actions.backToList')}
          </Button>
        </div>
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
          <TripDetail
            linkForm={linkForm}
            vehicles={fleet.viewModel.vehicles ?? []}
            workspace={workspace}
          />
          {/*
            Spec 061 D4: o painel da conta só existe para quem tem `trip.financials`. Quem monta a
            viagem decide pela avaliação prevista, que não mostra o que se paga ao agregado.
          */}
          {financials.canReadFinancials ? (
            <TripFinancialPanel
              isLoading={financials.isLoading}
              onRecalculate={financials.recalculate}
              result={financials.result}
              valuation={financials.valuation}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
