/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { navigateToCompanySettings } from '@/modules/company-settings/shared/companySettingsNavigation.service'
import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { navigateToCteProfiles } from '@/modules/nfe-workspace/shared/cteProfilesNavigation.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { TRIP_COST_ENTRY_AMOUNT_FIELD_ID } from '@/modules/trip-financials/components/TripCostEntryForm.component'
import { TripFinancialPanel } from '@/modules/trip-financials/components/TripFinancialPanel.component'
import type { GapActions } from '@/modules/trip-financials/components/ValuationLedger.component'
import { useTripCostEntries } from '@/modules/trip-financials/hooks/useTripCostEntries.hook'
import { useTripFinancials } from '@/modules/trip-financials/hooks/useTripFinancials.hook'
import { useTripRevenueEntries } from '@/modules/trip-financials/hooks/useTripRevenueEntries.hook'
import { GapRemedy } from '@/modules/trip-financials/shared/valuationLedger.service'

import { TripDetail, TripDetailSkeleton } from '../components/TripDetail.component'
import { TripTimeline } from '../components/TripTimeline.component'
import { useTripDocumentLinkForm } from '../hooks/useTripDocumentLinkForm.hook'
import { useTripTimeline } from '../hooks/useTripTimeline.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { navigateToTrips } from '../shared/tripRoute.service'
import styles from '../styles/trip.module.css'

type TripDetailPageProps = Readonly<{ tripId: string }>

export function TripDetailPage({ tripId }: TripDetailPageProps) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const canAdjustTollBooth = permissions.includes(SETTINGS_MANAGE_PERMISSION)
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
  /**
   * ⚠️ A lista de lançamentos entra **dentro** do painel, junto com a permissão que o abre. Quem tem
   * `trip.manage` e não tem `trip.financials` não vê nem o que ele mesmo lançou — é a assimetria
   * proposital da rota, e expor a lista ao lado do painel vazaria o valor que ela protege.
   */
  const costEntries = useTripCostEntries({ permissions, tripId })
  /** Spec 169 P1/RF4: a receita lançada — mesma trilha do gasto, dentro do mesmo painel. */
  const revenueEntries = useTripRevenueEntries({ permissions, tripId })

  /**
   * Spec 158 T8 (RF6): a linha do tempo fica entre o detalhe (paradas/notas) e o razão financeiro —
   * o mesmo lugar de `TripFinancialPanel`, montado ao lado dele pela mesma razão: a permissão que
   * cada painel exige é assimétrica (D4 aqui, `trip.financials` lá), e cada um decide sozinho se
   * aparece.
   */
  const timeline = useTripTimeline({ permissions, tripId })

  /**
   * O motivo da lacuna vira ação **só onde ela existe**. `planRoute` exige a viagem em `draft` — a
   * mesma condição de `TripStateActions.canPlanRoute` — porque fora dali `planRouteMutation`
   * recusaria a chamada; fora da condição, a lacuna volta a ser texto puro.
   *
   * ⚠️ Navegar é `onAct` com o navegador do shell, nunca `href`: a troca de workspace aqui é manual
   * e uma âncora recarregaria a app inteira.
   */
  const canPlanRoute = workspace.trip?.status === 'draft'
  const gapActions: GapActions = {
    [GapRemedy.EMISSION_PROFILE]: {
      onAct: () => navigateToCteProfiles(createBrowserWorkspaceNavigator()),
    },
    [GapRemedy.FEDERAL_REGIME]: {
      onAct: () =>
        navigateToCompanySettings({ navigator: createBrowserWorkspaceNavigator(), tab: 'taxes' }),
    },
    [GapRemedy.RECORD_COST]: {
      onAct: () => {
        const field = document.getElementById(TRIP_COST_ENTRY_AMOUNT_FIELD_ID)
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        field?.focus()
      },
    },
    ...(canPlanRoute
      ? {
          [GapRemedy.PLAN_ROUTE]: {
            isPending: workspace.planRouteMutation.isPending,
            onAct: () => workspace.planRouteMutation.mutate({ tripId }),
          },
        }
      : {}),
  }

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
            canAdjustTollBooth={canAdjustTollBooth}
            linkForm={linkForm}
            vehicles={fleet.viewModel.vehicles ?? []}
            workspace={workspace}
          />
          {/* Spec 158 T8 (RF6): entre o detalhe (paradas/notas) e o razão financeiro. */}
          {workspace.controller.canReadTrips ? (
            <TripTimeline openDocumentId={workspace.openProofDocumentId} query={timeline} />
          ) : null}
          {/*
            Spec 061 D4: o painel da conta só existe para quem tem `trip.financials`. Quem monta a
            viagem decide pela avaliação prevista, que não mostra o que se paga ao agregado.
          */}
          {financials.canReadFinancials ? (
            <TripFinancialPanel
              costEntries={costEntries}
              gapActions={gapActions}
              isError={financials.isError}
              isLoading={financials.isLoading}
              onRecalculate={financials.recalculate}
              onRetry={financials.refetch}
              result={financials.result}
              revenueEntries={revenueEntries}
              valuation={financials.valuation}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
