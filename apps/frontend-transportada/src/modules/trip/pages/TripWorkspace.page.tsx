/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { TripAssemblyDraftBanner } from '../components/TripAssemblyDraftBanner.component'
import { TripQuickCreateDialog } from '../components/TripQuickCreateDialog.component'
import { TripFilters } from '../components/TripFilters.component'
import { Tabs } from '@/components/ui/tabs'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'

import { TripDeliveryProofSettingsPanel } from '../components/TripDeliveryProofSettingsPanel.component'
import { TripOccurrenceNotifications } from '../components/TripOccurrenceNotifications.component'
import { TripRouteAssemblyLeftovers } from '../components/TripRouteAssemblyLeftovers.component'
import { TripRouteAssemblyDialog } from '../components/TripRouteAssemblyDialog.component'
import {
  useDeliveryProofOverridesQuery,
  useDeliveryProofSettingsQuery,
  useReplaceDeliveryProofOverridesMutation,
  useSaveCanhotoOcrEnabledMutation,
  useSaveDeliveryProofSettingsMutation,
} from '../queries/useDeliveryProofSettings.query'
import { TripTable } from '../components/TripTable.component'
import { useTripQuickCreate } from '../hooks/useTripQuickCreate.hook'
import { TRIP_LIST_QUERY_KEY } from '../shared/trip.constant'
import { useTripRouteAssembly } from '../hooks/useTripRouteAssembly.hook'
import { useTripTable } from '../hooks/useTripTable.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import { navigateToTrip } from '../shared/tripRoute.service'
import { type TripColumnKey, visibleTripColumns } from '../shared/tripTable.service'
import styles from '../styles/trip.module.css'

// Mesma grade da TripTable real (colunas + ação) — reaproveitado pelo gate de página e pelo gate
// da própria tabela para não trocar de forma entre os dois esqueletos. As colunas vêm de fora: sem
// `trip.financials` a tabela não tem as de dinheiro, e o esqueleto não pode anunciá-las (spec 156 L6).
type TripsTableSkeletonProps = Readonly<{ columns: readonly TripColumnKey[] }>

function renderSkeletonCell(column: TripColumnKey) {
  if (column === 'vehicleId') return <Skeleton variant="text" width="65%" />
  if (column === 'status') return <Skeleton height="1.4rem" width="5rem" />

  return <Skeleton variant="text" width="75%" />
}

function TripsTableSkeleton({ columns }: TripsTableSkeletonProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {t(`columns.${column}`)}
              </th>
            ))}
            <th scope="col">{t('actions.title')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }, (_, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{renderSkeletonCell(column)}</td>
              ))}
              <td>
                <Skeleton height="var(--field-height-compact)" width="4rem" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Esqueleto de página inteira: painel de criação, painel de filtros e tabela, na mesma grade dos
// painéis reais — só aparece antes de saber se o usuário tem acesso (authQuery ainda carregando).
function TripWorkspacePageSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup className={styles.deck} label={t('loading')}>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <Skeleton variant="text" width="9rem" />
          <Skeleton height="1.6rem" width="7rem" />
        </div>
        <div className={styles.fieldGrid}>
          <Skeleton height="var(--field-height)" width="100%" />
        </div>
        <div className={styles.driverChecklist}>
          <Skeleton height="1.25rem" width="7rem" />
          <Skeleton height="1.25rem" width="6rem" />
        </div>
      </div>
      <div className={styles.panel}>
        <Skeleton variant="text" width="6rem" />
        <div className={styles.fieldGrid}>
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <Skeleton variant="text" width="6rem" />
          <Skeleton variant="text" width="8rem" />
        </div>
        {/* Antes de saber a permissão, as colunas sem dinheiro — nunca anunciar o que pode faltar. */}
        <TripsTableSkeleton columns={visibleTripColumns({ canReadFinancials: false })} />
      </div>
    </SkeletonGroup>
  )
}

type TripTabId = 'notifications' | 'proof' | 'trips'

const TRIP_TABS: readonly TripTabId[] = ['trips', 'notifications', 'proof']

function resolveTripTab(id: string): TripTabId {
  return TRIP_TABS.find((tab) => tab === id) ?? 'trips'
}

export function TripWorkspacePage() {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const tenant = { ...(companyId === undefined ? {} : { companyId }), permissions }

  const workspace = useTripWorkspace(tenant)

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TripTabId>('trips')
  const canManageSettings = permissions.includes(SETTINGS_MANAGE_PERMISSION)
  const settingsScope = resolveSettingsDataScope('trip', activeTab)

  /**
   * Spec 079: é o `enabled` que faz o painel **vir preenchido** — abrir a aba busca o que já está
   * gravado, em vez de mostrar todos os tipos desligados até alguém recarregar.
   */
  const occurrenceTypesQuery = useQuery({
    enabled: canManageSettings && settingsScope.occurrenceNotifications,
    queryFn: () => workspace.controller.listOccurrenceTypes(),
    queryKey: ['trip', 'occurrence-types'] as const,
  })

  /**
   * ⚠️ Invalida em vez de escrever o cache com a resposta: o `PUT` devolve **um** tipo, e a lista
   * inteira mudou de ordem se o nome mudou. Escrever um item sobre a lista a deixaria mentindo.
   */
  const saveOccurrenceTypeMutation = useMutation({
    mutationFn: workspace.controller.saveOccurrenceType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip', 'occurrence-types'] })
    },
  })
  /**
   * Spec 082: mesmo desenho da 079 — permissão **e** aba aberta ligam a consulta, e é isso que faz
   * o painel do comprovante vir preenchido (ou com a fábrica que a API resolve) ao abrir a aba.
   */
  const deliveryProofSettingsQuery = useDeliveryProofSettingsQuery({
    enabled: canManageSettings && settingsScope.deliveryProofSettings,
  })
  const deliveryProofOverridesQuery = useDeliveryProofOverridesQuery({
    enabled: canManageSettings && settingsScope.deliveryProofSettings,
  })
  const saveDeliveryProofSettingsMutation = useSaveDeliveryProofSettingsMutation()
  const replaceDeliveryProofOverridesMutation = useReplaceDeliveryProofOverridesMutation()
  const saveCanhotoOcrEnabledMutation = useSaveCanhotoOcrEnabledMutation()

  const table = useTripTable({ canReadTrips: workspace.controller.canReadTrips, ...tenant })
  const fleet = useFleet(tenant)
  /**
   * Spec 107 D3: a placa de quem fica livre, para a frase da sobra nomear o caminhão. A frota já é
   * consultada aqui para os seletores da montagem — uma segunda consulta só para a placa seria
   * varrer a mesma lista duas vezes.
   */
  const userId = authQuery.data?.data.identity.userId
  /**
   * O rascunho da montagem só é lido com sessão **e** frota carregadas: a volta filtra motorista e
   * veículo pelos selecionáveis, e uma frota ainda vazia apagaria a escolha que está voltando.
   */
  const isFleetLoaded =
    fleet.viewModel.drivers !== undefined && fleet.viewModel.vehicles !== undefined
  const draftScope =
    companyId === undefined ||
    userId === undefined ||
    !isFleetLoaded ||
    !workspace.controller.canManageTrips
      ? undefined
      : { companyId, userId }
  /**
   * Estáveis entre renders: a montagem as consulta ao restaurar o rascunho, e uma lista nova a cada
   * render não diria nada de novo.
   */
  const fleetDrivers = fleet.viewModel.drivers
  const fleetVehicles = fleet.viewModel.vehicles
  const selectableDriverIds = useMemo(
    () =>
      (fleetDrivers ?? [])
        .filter((driver) => driver.status === 'active')
        .map((driver) => driver.id),
    [fleetDrivers],
  )
  const selectableVehicleIds = useMemo(
    () =>
      (fleetVehicles ?? [])
        .filter((vehicle) => vehicle.status === 'active' && vehicle.role === 'traction')
        .map((vehicle) => vehicle.id),
    [fleetVehicles],
  )
  const plateByVehicleId = new Map(
    (fleet.viewModel.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle.plate]),
  )
  /**
   * A viagem criada abre no detalhe: quem acabou de bipar dez notas quer conferir o roteiro, e
   * deixá-lo na lista o obrigaria a procurar a linha que ele mesmo acabou de criar.
   */
  const quickCreate = useTripQuickCreate({
    ...(companyId === undefined ? {} : { companyId }),
    draftScope,
    onCreated: (trip) =>
      navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId: trip.id }),
    permissions,
    selectableDriverIds,
    selectableVehicleIds,
  })
  /**
   * Spec 102: cancelar as marcadas, **uma por uma e em sequência**. `Promise.all` mandaria N
   * escritas concorrentes sobre o mesmo tenant, e a primeira falha esconderia quais das outras
   * chegaram a acontecer — aqui a lista para na falha, e o que já foi cancelado está cancelado.
   */
  const cancelSelectedMutation = useMutation({
    mutationFn: async () => {
      for (const trip of table.cancellableSelection) {
        await workspace.controller.cancelTrip({ tripId: trip.id })
      }
    },
    onSuccess: () => {
      table.clearSelection()
      void queryClient.invalidateQueries({ queryKey: TRIP_LIST_QUERY_KEY })
    },
  })

  const assembly = useTripRouteAssembly({
    canManageTrips: workspace.controller.canManageTrips,
    draftScope,
    /**
     * Uma viagem abre nela — quem montou quer conferir o roteiro. Várias ficam na lista, que é onde
     * elas cabem: abrir a primeira esconderia as outras que o mesmo clique acabou de criar.
     */
    onCreated: (trips) => {
      const [only] = trips
      if (trips.length === 1 && only !== undefined) {
        navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId: only.tripId })
      }
    },
    selectableDriverIds,
    selectableVehicleIds,
  })

  const isForbidden = companyId === undefined || !workspace.controller.canReadTrips
  const feedbackKey = resolveTripFeedbackKey(workspace.createMutation.error)

  return (
    <main className={styles.tripShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {authQuery.isLoading ? <TripWorkspacePageSkeleton /> : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}
      {authQuery.isSuccess && isForbidden ? (
        <p className={styles.hint} role="alert">
          {t('forbidden')}
        </p>
      ) : null}

      {authQuery.isSuccess && !isForbidden ? (
        <div className={styles.deck}>
          {/*
           * Spec 079: **configuração perto do efeito.** O aviso de ocorrência se liga aqui, na tela
           * onde a ocorrência é registrada e onde ela aparece — não numa tela de configurações que
           * cresce sem fim e deixa quem liga longe do efeito.
           */}
          <Tabs
            ariaLabel={t('title')}
            items={TRIP_TABS.map((tab) => ({
              id: tab,
              label: t(`tabs.${tab}`),
              panel:
                tab === 'notifications' ? (
                  <TripOccurrenceNotifications
                    canManage={canManageSettings}
                    isSaving={saveOccurrenceTypeMutation.isPending}
                    onSave={(type) => saveOccurrenceTypeMutation.mutate(type)}
                    types={occurrenceTypesQuery.data ?? []}
                  />
                ) : tab === 'proof' ? (
                  <TripDeliveryProofSettingsPanel
                    canManage={canManageSettings}
                    canhotoOcrEnabled={deliveryProofSettingsQuery.data?.canhotoOcrEnabled}
                    isSaving={
                      saveDeliveryProofSettingsMutation.isPending ||
                      replaceDeliveryProofOverridesMutation.isPending
                    }
                    isTogglingCanhotoOcr={saveCanhotoOcrEnabledMutation.isPending}
                    onReplaceOverrides={(overrides) =>
                      replaceDeliveryProofOverridesMutation.mutate(overrides)
                    }
                    onSaveSettings={(settings) =>
                      saveDeliveryProofSettingsMutation.mutate(settings)
                    }
                    onToggleCanhotoOcr={(fieldSettings, enabled) =>
                      saveCanhotoOcrEnabledMutation.mutate({
                        ...fieldSettings,
                        canhotoOcrEnabled: enabled,
                      })
                    }
                    overrides={deliveryProofOverridesQuery.data ?? []}
                    settings={deliveryProofSettingsQuery.data}
                    showError={
                      deliveryProofSettingsQuery.isError ||
                      deliveryProofOverridesQuery.isError ||
                      saveDeliveryProofSettingsMutation.isError ||
                      replaceDeliveryProofOverridesMutation.isError ||
                      saveCanhotoOcrEnabledMutation.isError
                    }
                  />
                ) : null,
            }))}
            onChange={(id) => setActiveTab(resolveTripTab(id))}
            value={activeTab}
          />

          {activeTab === 'notifications' || activeTab === 'proof' ? null : (
            <>
              {feedbackKey === null ? null : (
                <p className={styles.alert} role="alert">
                  {t(`feedback.${feedbackKey}`)}
                </p>
              )}

              {workspace.controller.canManageTrips ? (
                <div className={styles.actionActions}>
                  {/* Enquanto o rascunho volta, abrir o diálogo seria montar por cima dele. */}
                  <Button
                    disabled={quickCreate.draftStore.isRestoring}
                    onClick={quickCreate.open}
                    size="sm"
                    type="button"
                  >
                    <Icon name="add" />
                    {t('quickCreate.title')}
                  </Button>
                  <Button
                    disabled={assembly.assemblyDraft.isRestoring}
                    onClick={assembly.open}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Icon name="workspace-trip" />
                    {t('routeAssembly.title')}
                  </Button>
                </div>
              ) : null}

              {workspace.controller.canManageTrips ? (
                <TripAssemblyDraftBanner assembly={assembly} quickCreate={quickCreate} />
              ) : null}

              {assembly.outcome === null ? null : (
                <>
                  <p className={styles.hint} role="status">
                    {t('routeAssembly.outcomeAutomatic', { count: assembly.outcome.trips.length })}
                  </p>
                  {/* Spec 107: o que não entrou em viagem nenhuma, com o motivo de cada um. */}
                  <TripRouteAssemblyLeftovers
                    onRetry={assembly.retryWith}
                    outcome={assembly.outcome}
                    plateByVehicleId={plateByVehicleId}
                  />
                </>
              )}

              <TripRouteAssemblyDialog
                assembly={assembly}
                drivers={fleet.viewModel.drivers ?? []}
                permissions={permissions}
                vehicles={fleet.viewModel.vehicles ?? []}
              />

              <TripQuickCreateDialog
                availableDocuments={quickCreate.availableDocuments}
                drivers={fleet.viewModel.drivers ?? []}
                permissions={permissions}
                quickCreate={quickCreate}
                vehicles={fleet.viewModel.vehicles ?? []}
              />

              <TripFilters table={table} />

              {table.tripsQuery.isLoading ? (
                <SkeletonGroup className={styles.panel} label={t('loading')}>
                  <div className={styles.panelHead}>
                    <Skeleton variant="text" width="6rem" />
                    <Skeleton variant="text" width="8rem" />
                  </div>
                  <TripsTableSkeleton columns={table.columns} />
                </SkeletonGroup>
              ) : null}
              {table.tripsQuery.isError ? (
                <p className={styles.hint} role="alert">
                  {t('error')}
                </p>
              ) : null}

              {table.tripsQuery.isLoading ? null : (
                <TripTable
                  canCancel={workspace.controller.canManageTrips}
                  isCancelling={cancelSelectedMutation.isPending}
                  onCancelSelected={() => cancelSelectedMutation.mutate()}
                  table={table}
                  vehicles={fleet.viewModel.vehicles ?? []}
                />
              )}
            </>
          )}
        </div>
      ) : null}
    </main>
  )
}
