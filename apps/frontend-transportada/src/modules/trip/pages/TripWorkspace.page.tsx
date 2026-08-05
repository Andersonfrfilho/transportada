/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { TripCreationPanel } from '../components/TripCreationPanel.component'
import { TripFilters } from '../components/TripFilters.component'
import { TripTable } from '../components/TripTable.component'
import { useTripCreation } from '../hooks/useTripCreation.hook'
import { useTripTable } from '../hooks/useTripTable.hook'
import { useTripWorkspace } from '../hooks/useTripWorkspace.hook'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import styles from '../styles/trip.module.css'

export function TripWorkspacePage() {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const tenant = { ...(companyId === undefined ? {} : { companyId }), permissions }

  const workspace = useTripWorkspace(tenant)
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

      {authQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
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
            vehicles={fleet.viewModel.vehicles ?? []}
          />

          <TripFilters table={table} />

          {table.tripsQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
          {table.tripsQuery.isError ? (
            <p className={styles.hint} role="alert">
              {t('error')}
            </p>
          ) : null}

          <TripTable table={table} />
        </div>
      ) : null}
    </main>
  )
}
