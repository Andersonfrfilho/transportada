/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { UnassignedMessages } from '@/modules/occurrence-conversation/components/UnassignedMessages.component'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { TripOccurrenceColumnsMenu } from '../components/TripOccurrenceColumnsMenu.component'
import { TripOccurrenceFilters } from '../components/TripOccurrenceFilters.component'
import {
  TripOccurrenceTable,
  TripOccurrenceTableSkeleton,
} from '../components/TripOccurrenceTable.component'
import { TripOccurrenceTypesTab } from '../components/TripOccurrenceTypesTab.component'
import { useTripOccurrenceTable } from '../hooks/useTripOccurrenceTable.hook'
import styles from '../styles/trip.module.css'

/** A leitura de ocorrência é leitura de viagem — e leitura de viagem segue em `fleet.read`. */
const TRIP_READ_PERMISSION = 'fleet.read'
/** Spec 164 D7: validar a própria tratativa é `occurrences.resolve`, nunca `trip.manage`. */
const OCCURRENCE_CASE_RESOLVE_PERMISSION = 'occurrences.resolve'

type TripOccurrencesTabId = 'feed' | 'types'

const TRIP_OCCURRENCES_TABS: readonly TripOccurrencesTabId[] = ['feed', 'types']

function resolveTripOccurrencesTab(id: string): TripOccurrencesTabId {
  return TRIP_OCCURRENCES_TABS.find((tab) => tab === id) ?? 'feed'
}

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

function TripOccurrencesFeedContent({
  canResolveOccurrenceCases,
  isColumnsMenuOpen,
  onColumnsMenuToggle,
  table,
}: {
  canResolveOccurrenceCases: boolean
  isColumnsMenuOpen: boolean
  onColumnsMenuToggle: (open: boolean) => void
  table: ReturnType<typeof useTripOccurrenceTable>
}) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const companyId = authQuery.data?.data.company.id

  return (
    <>
      <UnassignedMessages
        canAssign={canResolveOccurrenceCases}
        {...(companyId === undefined ? {} : { companyId })}
      />
      <TripOccurrenceFilters table={table} />
      <section className={styles.panel} aria-labelledby="trip-occurrence-table-title">
        <div className={styles.panelHead}>
          <h2 id="trip-occurrence-table-title">{t('occurrenceFeed.tableTitle')}</h2>
          <Button
            aria-expanded={isColumnsMenuOpen}
            onClick={() => onColumnsMenuToggle(!isColumnsMenuOpen)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="columns" />
            {t('occurrenceFeed.columnsMenu.title')}
          </Button>
        </div>
        {isColumnsMenuOpen ? <TripOccurrenceColumnsMenu table={table} /> : null}
        <TripOccurrenceTable canResolveOccurrenceCases={canResolveOccurrenceCases} table={table} />
      </section>
    </>
  )
}

export function TripOccurrencesWorkspacePage() {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const [isColumnsMenuOpen, setColumnsMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TripOccurrencesTabId>('feed')

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const canReadOccurrences = companyId !== undefined && permissions.includes(TRIP_READ_PERMISSION)
  const canResolveOccurrenceCases = permissions.includes(OCCURRENCE_CASE_RESOLVE_PERMISSION)
  const canManageSettings = permissions.includes(SETTINGS_MANAGE_PERMISSION)

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
          <Tabs
            ariaLabel={t('occurrenceFeed.title')}
            items={TRIP_OCCURRENCES_TABS.map((tab) => ({
              id: tab,
              label:
                tab === 'feed' ? t('occurrenceFeed.tabs.feed') : t('occurrenceFeed.tabs.types'),
              panel:
                tab === 'feed' ? (
                  <TripOccurrencesFeedContent
                    canResolveOccurrenceCases={canResolveOccurrenceCases}
                    isColumnsMenuOpen={isColumnsMenuOpen}
                    onColumnsMenuToggle={setColumnsMenuOpen}
                    table={table}
                  />
                ) : canManageSettings ? (
                  <TripOccurrenceTypesTab canManage={canManageSettings} />
                ) : null,
            }))}
            onChange={(id) => setActiveTab(resolveTripOccurrencesTab(id))}
            value={activeTab}
          />
        </div>
      ) : null}
    </main>
  )
}
