/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { TripDetail } from '../components/TripDetail.component'
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
  const linkForm = useTripDocumentLinkForm()

  function handleBackToTrips(): void {
    navigateToTrips(createBrowserWorkspaceNavigator())
  }

  return (
    <main className={styles.tripShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('detail.title')}</h1>
      </header>
      {authQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}
      {authQuery.isSuccess ? (
        <div className={styles.deck}>
          <TripDetail linkForm={linkForm} onClose={handleBackToTrips} workspace={workspace} />
        </div>
      ) : null}
    </main>
  )
}
