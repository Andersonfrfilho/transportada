/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { TripCreationPanel } from '../components/TripCreationPanel.component'
import { TripFilters } from '../components/TripFilters.component'
import { Tabs } from '@/components/ui/tabs'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'

import { TripOccurrenceNotifications } from '../components/TripOccurrenceNotifications.component'
import { TripTable } from '../components/TripTable.component'
import { useTripCreation } from '../hooks/useTripCreation.hook'
import { useTripTable } from '../hooks/useTripTable.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
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

type TripTabId = 'notifications' | 'trips'

const TRIP_TABS: readonly TripTabId[] = ['trips', 'notifications']

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
  const occurrenceNotificationsQuery = useQuery({
    enabled: canManageSettings && settingsScope.occurrenceNotifications,
    queryFn: () => workspace.controller.readOccurrenceNotifications(),
    queryKey: ['trip', 'occurrence-notifications'] as const,
  })

  const saveOccurrenceNotificationMutation = useMutation({
    mutationFn: workspace.controller.saveOccurrenceNotification,
    onSuccess: (entries) => {
      queryClient.setQueryData(['trip', 'occurrence-notifications'], entries)
    },
  })
  const table = useTripTable({ canReadTrips: workspace.controller.canReadTrips, ...tenant })
  const creation = useTripCreation()
  const fleet = useFleet(tenant)

  const isForbidden = companyId === undefined || !workspace.controller.canReadTrips
  const feedbackKey = resolveTripFeedbackKey(workspace.createMutation.error)

  function handleCreate(): void {
    workspace.createMutation.mutate(creation.draft, { onSuccess: creation.reset })
  }

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
                    entries={occurrenceNotificationsQuery.data ?? []}
                    isSaving={saveOccurrenceNotificationMutation.isPending}
                    onToggle={(toggle) => saveOccurrenceNotificationMutation.mutate(toggle)}
                  />
                ) : null,
            }))}
            onChange={(id) => setActiveTab(resolveTripTab(id))}
            value={activeTab}
          />

          {activeTab === 'notifications' ? null : (
            <>
              {feedbackKey === null ? null : (
                <p className={styles.alert} role="alert">
                  {t(`feedback.${feedbackKey}`)}
                </p>
              )}

              <TripCreationPanel
                creation={creation}
                drivers={fleet.viewModel.drivers ?? []}
                isCreatePending={workspace.createMutation.isPending}
                isReadOnly={!workspace.controller.canManageTrips}
                onCreate={handleCreate}
                tenant={tenant}
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

              {table.tripsQuery.isLoading ? null : <TripTable table={table} />}
            </>
          )}
        </div>
      ) : null}
    </main>
  )
}
