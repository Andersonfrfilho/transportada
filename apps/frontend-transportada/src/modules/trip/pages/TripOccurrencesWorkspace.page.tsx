/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { TripOccurrenceColumnsMenu } from '../components/TripOccurrenceColumnsMenu.component'
import { TripOccurrenceFilters } from '../components/TripOccurrenceFilters.component'
import {
  TripOccurrenceTable,
  TripOccurrenceTableSkeleton,
} from '../components/TripOccurrenceTable.component'
import { useTripOccurrenceTable } from '../hooks/useTripOccurrenceTable.hook'
import styles from '../styles/trip.module.css'

/** A leitura de ocorrência é leitura de viagem — e leitura de viagem segue em `fleet.read`. */
const TRIP_READ_PERMISSION = 'fleet.read'

function TripOccurrencesPageSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup className={styles.deck} label={t('loading')}>
      <div className={styles.panel}>
        <Skeleton variant="text" width="8rem" />
        <div className={styles.fieldGrid}>
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
        </div>
      </div>
      <div className={styles.panel}>
        <Skeleton variant="text" width="7rem" />
        <TripOccurrenceTableSkeleton />
      </div>
    </SkeletonGroup>
  )
}

export function TripOccurrencesWorkspacePage() {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const [isColumnsMenuOpen, setColumnsMenuOpen] = useState(false)

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const canReadOccurrences = companyId !== undefined && permissions.includes(TRIP_READ_PERMISSION)

  const table = useTripOccurrenceTable({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canReadOccurrences,
  })

  return (
    <main className={styles.tripShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('occurrenceFeed.kicker')}</p>
        <h1>{t('occurrenceFeed.title')}</h1>
        <p className={styles.intro}>{t('occurrenceFeed.intro')}</p>
      </header>

      {authQuery.isLoading ? <TripOccurrencesPageSkeleton /> : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}
      {authQuery.isSuccess && !canReadOccurrences ? (
        <p className={styles.hint} role="alert">
          {t('forbidden')}
        </p>
      ) : null}

      {authQuery.isSuccess && canReadOccurrences ? (
        <div className={styles.deck}>
          <TripOccurrenceFilters table={table} />
          <section className={styles.panel} aria-labelledby="trip-occurrence-table-title">
            <div className={styles.panelHead}>
              <h2 id="trip-occurrence-table-title">{t('occurrenceFeed.tableTitle')}</h2>
              <Button
                aria-expanded={isColumnsMenuOpen}
                onClick={() => setColumnsMenuOpen(!isColumnsMenuOpen)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="columns" />
                {t('occurrenceFeed.columnsMenu.title')}
              </Button>
            </div>
            {isColumnsMenuOpen ? <TripOccurrenceColumnsMenu table={table} /> : null}
            <TripOccurrenceTable table={table} />
          </section>
        </div>
      ) : null}
    </main>
  )
}
