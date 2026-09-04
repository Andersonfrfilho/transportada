/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { TripQuickCreateDialog } from '../components/TripQuickCreateDialog.component'
import { TripFilters } from '../components/TripFilters.component'
import { Tabs } from '@/components/ui/tabs'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'

import { TripDeliveryProofSettingsPanel } from '../components/TripDeliveryProofSettingsPanel.component'
import { TripOccurrenceNotifications } from '../components/TripOccurrenceNotifications.component'
import { TripRouteAssemblyDialog } from '../components/TripRouteAssemblyDialog.component'
import {
  useDeliveryProofOverridesQuery,
  useDeliveryProofSettingsQuery,
  useReplaceDeliveryProofOverridesMutation,
  useSaveDeliveryProofSettingsMutation,
} from '../queries/useDeliveryProofSettings.query'
import { TripTable } from '../components/TripTable.component'
import { useTripQuickCreate } from '../hooks/useTripQuickCreate.hook'
import { useTripRouteAssembly } from '../hooks/useTripRouteAssembly.hook'
import { useTripTable } from '../hooks/useTripTable.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import { navigateToTrip } from '../shared/tripRoute.service'
import { TRIP_COLUMN_KEYS } from '../shared/tripTable.service'
import styles from '../styles/trip.module.css'

// Mesma grade da TripTable real (colunas + ação) — reaproveitado pelo gate de página e pelo gate
// da própria tabela para não trocar de forma entre os dois esqueletos.
function TripsTableSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            {TRIP_COLUMN_KEYS.map((column) => (
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
              <td>
                <Skeleton variant="text" width="65%" />
              </td>
              <td>
                <Skeleton height="1.4rem" width="5rem" />
              </td>
              <td>
                <Skeleton variant="text" width="75%" />
              </td>
              <td>
                <Skeleton variant="text" width="75%" />
              </td>
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
        <TripsTableSkeleton />
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

  const table = useTripTable({ canReadTrips: workspace.controller.canReadTrips, ...tenant })
  const fleet = useFleet(tenant)
  /**
   * A viagem criada abre no detalhe: quem acabou de bipar dez notas quer conferir o roteiro, e
   * deixá-lo na lista o obrigaria a procurar a linha que ele mesmo acabou de criar.
   */
  const quickCreate = useTripQuickCreate({
    ...(companyId === undefined ? {} : { companyId }),
    onCreated: (trip) =>
      navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId: trip.id }),
    permissions,
    selectableDriverIds: (fleet.viewModel.drivers ?? [])
      .filter((driver) => driver.status === 'active')
      .map((driver) => driver.id),
    selectableVehicleIds: (fleet.viewModel.vehicles ?? [])
      .filter((vehicle) => vehicle.status === 'active' && vehicle.role === 'traction')
      .map((vehicle) => vehicle.id),
  })
  const assembly = useTripRouteAssembly({
    canManageTrips: workspace.controller.canManageTrips,
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
    selectableDriverIds: (fleet.viewModel.drivers ?? [])
      .filter((driver) => driver.status === 'active')
      .map((driver) => driver.id),
    selectableVehicleIds: (fleet.viewModel.vehicles ?? [])
      .filter((vehicle) => vehicle.status === 'active' && vehicle.role === 'traction')
      .map((vehicle) => vehicle.id),
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
                    isSaving={
                      saveDeliveryProofSettingsMutation.isPending ||
                      replaceDeliveryProofOverridesMutation.isPending
                    }
                    onReplaceOverrides={(overrides) =>
                      replaceDeliveryProofOverridesMutation.mutate(overrides)
                    }
                    onSaveSettings={(settings) =>
                      saveDeliveryProofSettingsMutation.mutate(settings)
                    }
                    overrides={deliveryProofOverridesQuery.data ?? []}
                    settings={deliveryProofSettingsQuery.data}
                    showError={
                      deliveryProofSettingsQuery.isError ||
                      deliveryProofOverridesQuery.isError ||
                      saveDeliveryProofSettingsMutation.isError ||
                      replaceDeliveryProofOverridesMutation.isError
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
                  <Button onClick={quickCreate.open} size="sm" type="button">
                    <Icon name="add" />
                    {t('quickCreate.title')}
                  </Button>
                  <Button onClick={assembly.open} size="sm" type="button" variant="secondary">
                    <Icon name="workspace-trip" />
                    {t('routeAssembly.title')}
                  </Button>
                </div>
              ) : null}

              {/*
                O resultado mora **na lista**, não no modal que o produziu: ele fecha ao criar, e a
                mensagem dentro dele aparecia cercada dos avisos de campo vazio que a limpeza do
                formulário trazia de volta — sucesso com cara de falha.
              */}
              {assembly.outcome === null ? null : (
                <p className={styles.hint} role="status">
                  {t('routeAssembly.outcomeAutomatic', { count: assembly.outcome.trips.length })}
                </p>
              )}

              <TripRouteAssemblyDialog
                assembly={assembly}
                drivers={fleet.viewModel.drivers ?? []}
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
                  <TripsTableSkeleton />
                </SkeletonGroup>
              ) : null}
              {table.tripsQuery.isError ? (
                <p className={styles.hint} role="alert">
                  {t('error')}
                </p>
              ) : null}

              {table.tripsQuery.isLoading ? null : (
                <TripTable table={table} vehicles={fleet.viewModel.vehicles ?? []} />
              )}
            </>
          )}
        </div>
      ) : null}
    </main>
  )
}
