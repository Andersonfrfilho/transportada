/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'
import {
  navigateToDriverOccurrenceList,
  type DriverOccurrenceListFilter,
} from '@/modules/shared/driverRoute.service'

import { DriverOccurrenceRow } from '../components/DriverOccurrenceRow.component'
import type { RouteOccurrenceView } from '../hooks/useRouteOccurrenceEntries.hook'
import { useOccurrenceShare } from '../hooks/useOccurrenceShare.hook'
import { formatActivityTime } from '../shared/documentActivity.service'
import type { DriverTripStop } from '../shared/driverTrip.types'
import {
  countRouteOccurrencesByFilter,
  filterRouteOccurrences,
  groupRouteOccurrences,
  scopeRouteOccurrences,
} from '../shared/routeOccurrenceView.service'
import type {
  RouteOccurrenceEntry,
  RouteOccurrenceFilter,
} from '../shared/routeOccurrenceView.types'
import styles from '../styles/routeOccurrence.module.css'

const FILTERS: ReadonlyArray<readonly [RouteOccurrenceFilter, IconName | undefined]> = [
  ['all', undefined],
  ['unread', 'message'],
  ['documents', 'paperclip'],
  ['refused', 'close'],
  ['queued', 'clock'],
]

type DriverRouteOccurrencesPageProps = Readonly<{
  /** Sem sinal no boot: a consulta nem roda, e a lista só tem o que a fila local sabe. */
  isOffline: boolean
  scope: DriverOccurrenceListFilter
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

function handleBack(): void {
  window.history.back()
}

function describeScope(input: {
  readonly scope: DriverOccurrenceListFilter
  readonly stops: readonly DriverTripStop[]
  readonly entries: readonly RouteOccurrenceEntry[]
  readonly t: TFunction<'driverTrip'>
}): string | undefined {
  const { entries, scope, stops, t } = input
  if (scope.documentId !== undefined) {
    const number = entries.find((entry) => entry.documentId === scope.documentId)?.documentNumber
    return t('routeOccurrence.list.scope.note', { number: number ?? '' })
  }
  if (scope.stopId === undefined) return undefined
  const sequence = stops.find((stop) => stop.id === scope.stopId)?.sequence ?? ''
  return t('routeOccurrence.list.scope.stop', { sequence })
}

/** Spec 266 RF4: as ocorrências da rota — em aberto primeiro, resolvidas e canceladas embaixo. */
export function DriverRouteOccurrencesPage({
  isOffline,
  scope,
  stops,
  view,
}: DriverRouteOccurrencesPageProps) {
  const { t } = useTranslation('driverTrip')
  const [activeFilter, setActiveFilter] = useState<RouteOccurrenceFilter>('all')
  const shareController = useOccurrenceShare()

  const scoped = scopeRouteOccurrences({ entries: view.entries, scope })
  const counts = countRouteOccurrencesByFilter(scoped)
  const visible = filterRouteOccurrences({ entries: scoped, filter: activeFilter })
  const groups = groupRouteOccurrences(visible)
  const scopeLabel = describeScope({ entries: view.entries, scope, stops, t })
  const isTripFinished = view.listStatus === 'tripFinished'
  const isWaitingForData = view.listStatus === 'loading' && view.entries.length === 0

  function renderGroup(input: {
    readonly entries: readonly RouteOccurrenceEntry[]
    readonly icon: IconName
    readonly titleKey: string
  }) {
    if (input.entries.length === 0) return null
    return (
      <>
        <p className={styles.groupTitle}>
          <span>
            <Icon name={input.icon} size="sm" /> {t(input.titleKey)}
          </span>
          <span>{input.entries.length}</span>
        </p>
        {input.entries.map((entry) => (
          <DriverOccurrenceRow
            entry={entry}
            key={entry.id}
            shareController={shareController}
            stops={stops}
          />
        ))}
      </>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          aria-label={t('routeOccurrence.list.back')}
          className={styles.headerBack}
          title={t('routeOccurrence.list.back')}
          type="button"
          onClick={handleBack}
        >
          <Icon name="arrow-left" />
        </button>
        <h1 className={styles.headerTitle}>{t('routeOccurrence.list.title')}</h1>
      </header>

      {isTripFinished ? (
        <section className={styles.notice} role="status">
          <strong>{t('routeOccurrence.list.tripFinished')}</strong>
          <p>{t('routeOccurrence.list.tripFinishedHint')}</p>
        </section>
      ) : null}

      {!isTripFinished && isWaitingForData ? (
        <p className={styles.notice} role="status">
          {t(isOffline ? 'routeOccurrence.list.offlineEmpty' : 'routeOccurrence.list.loading')}
        </p>
      ) : null}

      {!isTripFinished && !isWaitingForData ? (
        <>
          {isOffline || view.isFromSnapshot ? (
            <p className={styles.notice} role="status">
              {t('routeOccurrence.list.offline', {
                time: view.savedAt === undefined ? '' : formatActivityTime(view.savedAt),
              })}
            </p>
          ) : null}
          {scopeLabel === undefined ? null : (
            <div className={styles.scopeBanner} data-scope="">
              <span>{scopeLabel}</span>
              <button
                className={styles.filterButton}
                type="button"
                onClick={() => navigateToDriverOccurrenceList({})}
              >
                {t('routeOccurrence.list.scope.clear')}
              </button>
            </div>
          )}
          <div
            aria-label={t('routeOccurrence.list.filter.group')}
            className={styles.filters}
            role="group"
          >
            {FILTERS.map(([filter, icon]) => {
              const label = t(`routeOccurrence.list.filter.${filter}`)
              const countLabel = t('routeOccurrence.list.filter.count', {
                count: counts[filter],
                label,
              })
              return (
                <button
                  aria-label={countLabel}
                  aria-pressed={activeFilter === filter}
                  className={styles.filterButton}
                  data-filter={filter}
                  key={filter}
                  title={countLabel}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                >
                  {icon === undefined ? label : <Icon name={icon} />}
                  <span className={styles.filterCount}>{counts[filter]}</span>
                </button>
              )
            })}
          </div>
          {shareController.notice === undefined ? null : (
            <p className={styles.notice} role="status">
              {t(`routeOccurrence.share.${shareController.notice}`)}
            </p>
          )}
          <div className={styles.list}>
            {renderGroup({
              entries: groups.open,
              icon: 'alert',
              titleKey: 'routeOccurrence.list.open',
            })}
            {renderGroup({
              entries: groups.closed,
              icon: 'check',
              titleKey: 'routeOccurrence.list.closed',
            })}
            {visible.length === 0 ? (
              <p className={styles.notice}>
                {t(
                  view.entries.length === 0
                    ? 'routeOccurrence.list.emptyTrip'
                    : 'routeOccurrence.list.empty',
                )}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  )
}
