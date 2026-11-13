/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount, formatRateAmount } from '@/modules/shared/decimalAmount.service'

import {
  useAvailableExpenseTrips,
  useExpenseMutations,
  useExpenseOccurrenceTrips,
} from '../hooks/useExpenses.hook'
import type { ExpenseOccurrenceListItem, ExpenseOccurrenceTrip } from '../shared/expenses.types'
import { formatCivilDate, resolvePayeeLabelKey } from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'
import { ExpenseDialogShell } from './ExpenseDialogShell.component'

type ExpenseTripsDialogProps = Readonly<{
  canManage: boolean
  occurrence: ExpenseOccurrenceListItem
  onClose: () => void
}>

function tripLabel(trip: Readonly<{ tripId: string }>): string {
  return trip.tripId.slice(0, 8)
}

/**
 * T2.2b / RF1d: viagens que formam o pagamento do motorista, agregado ou ajudante. O valor de cada
 * linha é o da parcela da viagem (diária × dias, spec 143), copiado pela API — o painel só mostra.
 * Incluir e remover recalculam o previsto no servidor, então não há botão "usar como previsto".
 */
export function ExpenseTripsDialog({ canManage, occurrence, onClose }: ExpenseTripsDialogProps) {
  const { t } = useTranslation('expenses')
  const trips = useExpenseOccurrenceTrips({ occurrenceId: occurrence.id })
  const [isAdding, setIsAdding] = useState(false)
  const available = useAvailableExpenseTrips({ enabled: isAdding, occurrenceId: occurrence.id })
  const { includeTrip, removeTrip } = useExpenseMutations()
  const isOpen = occurrence.status === 'open'
  const canEdit = canManage && isOpen
  const payeeKey = resolvePayeeLabelKey(occurrence.payeeDriverPaymentModel)
  const error = includeTrip.error ?? removeTrip.error ?? trips.error ?? available.error
  const included = trips.data?.items ?? []
  const includedKeys = new Set(included.map((trip) => `${trip.tripId}:${trip.parcelKind}`))
  const candidates = (available.data?.available ?? []).filter(
    (trip) => !includedKeys.has(`${trip.tripId}:${trip.parcelKind}`),
  )

  function renderRow(trip: ExpenseOccurrenceTrip, action: 'include' | 'remove') {
    const isBusy = includeTrip.isPending || removeTrip.isPending
    return (
      <tr key={`${trip.tripId}:${trip.parcelKind}`}>
        <td data-column={t('trips.trip')}>
          {t('trips.tripNumber', { id: tripLabel(trip) })}
          <span className={styles.rowDetail}>{t(`parcelKind.${trip.parcelKind}`)}</span>
        </td>
        <td data-column={t('trips.completedOn')}>{formatCivilDate(trip.completedOn)}</td>
        <td data-column={t('trips.dailyTimesDays')}>
          {t('trips.dailyTimesDaysValue', {
            count: trip.days,
            daily: formatRateAmount(trip.dailyAmount),
          })}
        </td>
        <td data-column={t('trips.amount')}>{formatAmount(trip.amount)}</td>
        <td>
          {canEdit ? (
            <Button
              disabled={isBusy}
              onClick={() =>
                action === 'remove'
                  ? removeTrip.mutate({ occurrenceId: occurrence.id, tripId: trip.tripId })
                  : includeTrip.mutate({ occurrenceId: occurrence.id, tripId: trip.tripId })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {action === 'remove' ? t('trips.remove') : t('trips.include')}
            </Button>
          ) : null}
        </td>
      </tr>
    )
  }

  const tableHead = (
    <thead>
      <tr>
        <th scope="col">{t('trips.trip')}</th>
        <th scope="col">{t('trips.completedOn')}</th>
        <th scope="col">{t('trips.dailyTimesDays')}</th>
        <th scope="col">{t('trips.amount')}</th>
        <th scope="col">
          <span className={styles.srOnly}>{t('trips.actions')}</span>
        </th>
      </tr>
    </thead>
  )

  return (
    <ExpenseDialogShell
      footer={
        <>
          {canEdit ? (
            <Button
              onClick={() => setIsAdding((current) => !current)}
              type="button"
              variant="secondary"
            >
              <Icon name="package" />
              {isAdding ? t('trips.hideAvailable') : t('trips.add')}
            </Button>
          ) : null}
          <Button onClick={onClose} type="button">
            {t('dialog.close')}
          </Button>
        </>
      }
      hint={t('trips.summary', {
        name: occurrence.expenseName,
        payee:
          occurrence.payeeDriverName === null || payeeKey === null
            ? ''
            : ` · ${occurrence.payeeDriverName} (${t(`payee.${payeeKey}`)})`,
      })}
      onClose={onClose}
      title={t('trips.title')}
      titleId="expense-trips-title"
    >
      {trips.isPending ? (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : included.length === 0 ? (
        <p className={styles.hint}>{t('trips.empty')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            {tableHead}
            <tbody>{included.map((trip) => renderRow(trip, 'remove'))}</tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  {t('trips.total')}
                </th>
                <td>{formatAmount(trips.data?.tripsTotal ?? '0')}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isAdding ? (
        <section aria-label={t('trips.availableTitle')} className={styles.available}>
          <h3>{t('trips.availableTitle')}</h3>
          {available.isPending ? (
            <SkeletonGroup label={t('loading')}>
              <Skeleton height="2.5rem" />
            </SkeletonGroup>
          ) : candidates.length === 0 ? (
            <p className={styles.hint}>{t('trips.availableEmpty')}</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                {tableHead}
                <tbody>{candidates.map((trip) => renderRow(trip, 'include'))}</tbody>
              </table>
            </div>
          )}
          {(available.data?.pending ?? []).map((trip) => (
            <p className={styles.warning} key={`${trip.tripId}:${trip.parcelKind}`} role="status">
              {t('trips.pendingTrip', {
                gap: t(`gap.${trip.gap}`, { defaultValue: t('gap.OTHER') }),
                id: tripLabel(trip),
              })}
            </p>
          ))}
        </section>
      ) : null}

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${error.message}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}
    </ExpenseDialogShell>
  )
}
