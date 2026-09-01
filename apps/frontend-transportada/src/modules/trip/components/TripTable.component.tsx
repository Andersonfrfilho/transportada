/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TripTableController } from '../hooks/useTripTable.hook'
import type { Trip, TripStatus } from '../shared/trip.types'
import { TRIP_COLUMN_KEYS, type TripColumnKey } from '../shared/tripTable.service'
import styles from '../styles/trip.module.css'

type TripTableProps = Readonly<{ table: TripTableController }>

function statusClassName(status: TripStatus): string {
  return status === 'completed' || status === 'cancelled'
    ? `${styles.statusBadge} ${styles.statusReady}`
    : `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

export function TripTable({ table }: TripTableProps) {
  const { t } = useTranslation('trip')

  function renderCell(trip: Trip, column: TripColumnKey) {
    if (column === 'status') {
      return <span className={statusClassName(trip.status)}>{t(`status.${trip.status}`)}</span>
    }
    if (column === 'createdAt') return formatMoment(trip.createdAt)
    if (column === 'updatedAt') return formatMoment(trip.updatedAt)
    return trip[column]
  }

  function sortIndicator(column: TripColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: TripColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-table-title">
      <div className={styles.panelHead}>
        <h2 id="trip-table-title">{t('tripsTitle')}</h2>
        <p className={styles.counter}>{t('resultCounter', { shown: table.visibleItems.length })}</p>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {TRIP_COLUMN_KEYS.map((column) => (
                <th key={column} scope="col">
                  <button
                    className={styles.sortButton}
                    onClick={() => table.toggleSort(column)}
                    type="button"
                  >
                    {t(`columns.${column}`)}
                    <span className={styles.sortIndicator} aria-hidden="true">
                      {sortIndicator(column)}
                    </span>
                    <span className={styles.srOnly}>{sortLabel(column)}</span>
                  </button>
                </th>
              ))}
              <th scope="col">{t('actions.title')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleItems.map((trip) => (
              <tr key={trip.id}>
                {TRIP_COLUMN_KEYS.map((column) => (
                  <td key={column}>{renderCell(trip, column)}</td>
                ))}
                <td>
                  <Button
                    onClick={() => table.openTrip(trip.id)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Icon name="eye" />
                    {t('actions.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleItems.length === 0 ? <p className={styles.hint}>{t('empty')}</p> : null}

      <div className={styles.toolbar}>
        <Button
          aria-label={t('pagination.previous')}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="page-previous" />
          {t('pagination.previous')}
        </Button>
        <Button
          aria-label={t('pagination.next')}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t('pagination.next')}
          <Icon name="page-next" />
        </Button>
      </div>
    </section>
  )
}
