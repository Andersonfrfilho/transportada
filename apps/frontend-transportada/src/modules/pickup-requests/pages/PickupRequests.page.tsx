/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import {
  usePickupRequestActions,
  usePickupRequestDetail,
  usePickupRequestList,
} from '../hooks/usePickupRequests.hook'
import {
  PICKUP_MANAGE_PERMISSION,
  PICKUP_REQUEST_STATUSES,
  type PickupAddress,
  type PickupRequestStatus,
  type PickupRequestView,
} from '../shared/pickupRequest.types'
import styles from '../styles/pickupRequests.module.css'

const ALL = 'all'
const DECIDABLE: readonly PickupRequestStatus[] = ['requested']

function formatDay(value: string): string {
  const [year = '', month = '', day = ''] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatAddress(address: PickupAddress): string {
  return `${address.street}, ${address.number} · ${address.district} · ${address.city}/${address.state}`
}

function statusVariant(status: PickupRequestStatus) {
  if (status === 'requested') return 'warning' as const
  if (status === 'accepted' || status === 'scheduled' || status === 'done')
    return 'success' as const
  return 'secondary' as const
}

function useCalendarLabels() {
  const { t } = useTranslation('pickupRequests')
  return {
    chooseYearLabel: t('calendar.chooseYear'),
    clearLabel: t('calendar.clear'),
    nextMonthLabel: t('calendar.nextMonth'),
    openCalendarLabel: t('calendar.open'),
    placeholder: t('calendar.placeholder'),
    previousMonthLabel: t('calendar.previousMonth'),
  }
}

export function PickupRequestsPage() {
  const { t } = useTranslation('pickupRequests')
  const auth = useAuthMeQuery()
  const [filter, setFilter] = useState<string>('requested')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const status = filter === ALL ? null : (filter as PickupRequestStatus)
  const canManage = auth.data?.data.permissions.includes(PICKUP_MANAGE_PERMISSION) === true
  const list = usePickupRequestList({ status })

  if (auth.data !== undefined && !canManage) {
    return (
      <main className={styles.shell}>
        <p className={styles.error} role="alert">
          {t('forbidden')}
        </p>
      </main>
    )
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>
      <div className={styles.toolbar}>
        <Select
          ariaLabel={t('filter.label')}
          onChange={setFilter}
          options={[
            { label: t('filter.all'), value: ALL },
            ...PICKUP_REQUEST_STATUSES.map((value) => ({ label: t(`status.${value}`), value })),
          ]}
          value={filter}
        />
      </div>
      <div className={styles.layout}>
        <section aria-label={t('list.title')} className={styles.list}>
          {list.isLoading ? (
            <SkeletonGroup label={t('list.title')}>
              <Skeleton />
              <Skeleton />
            </SkeletonGroup>
          ) : null}
          {list.isError ? (
            <p className={styles.error} role="alert">
              {t('errors.REQUEST_FAILED')}
            </p>
          ) : null}
          {list.data?.length === 0 ? <p className={styles.hint}>{t('list.empty')}</p> : null}
          {list.data?.map((item) => (
            <RequestRow
              isSelected={item.id === selectedId}
              item={item}
              key={item.id}
              onSelect={() => setSelectedId(item.id)}
            />
          ))}
        </section>
        {selectedId === null ? null : <RequestDetail id={selectedId} />}
      </div>
    </main>
  )
}

function RequestRow(
  props: Readonly<{ isSelected: boolean; item: PickupRequestView; onSelect: () => void }>,
) {
  const { t } = useTranslation('pickupRequests')
  const { isSelected, item, onSelect } = props
  return (
    <button
      aria-pressed={isSelected}
      className={styles.row}
      data-selected={isSelected}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.rowHead}>
        <strong>{item.requesterName}</strong>
        <Badge variant={statusVariant(item.status)}>{t(`status.${item.status}`)}</Badge>
      </span>
      <span>
        {t(`kind.${item.kind}`)} · {item.origin.city} → {item.destination.city}
      </span>
      <span className={styles.hint}>
        {formatDay(item.windowStart)} – {formatDay(item.windowEnd)} · {item.volumes}{' '}
        {t('detail.volumes')} · {item.weightKg} kg
      </span>
    </button>
  )
}

function RequestDetail({ id }: Readonly<{ id: string }>) {
  const { t } = useTranslation('pickupRequests')
  const calendar = useCalendarLabels()
  const detail = usePickupRequestDetail(id)
  const actions = usePickupRequestActions()
  const [note, setNote] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'accept' | 'refuse' | null>(null)

  if (detail.isLoading) return <Skeleton />
  if (detail.data === undefined) {
    return (
      <p className={styles.error} role="alert">
        {t('errors.REQUEST_FAILED')}
      </p>
    )
  }
  const { request, suggestion } = detail.data
  const failure = [actions.accept, actions.refuse, actions.schedule].find((m) => m.isError)
  const failureCode = failure?.error instanceof Error ? failure.error.message : null

  return (
    <section aria-label={t('detail.title')} className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{request.requesterName}</h2>
        <Badge variant={statusVariant(request.status)}>{t(`status.${request.status}`)}</Badge>
      </div>
      <dl className={styles.lines}>
        <div>
          <dt>{t('detail.origin')}</dt>
          <dd>{formatAddress(request.origin)}</dd>
        </div>
        <div>
          <dt>{t('detail.destination')}</dt>
          <dd>{formatAddress(request.destination)}</dd>
        </div>
        <div>
          <dt>{t('detail.window')}</dt>
          <dd>
            {formatDay(request.windowStart)} – {formatDay(request.windowEnd)}
          </dd>
        </div>
        <div>
          <dt>{t('detail.cargo')}</dt>
          <dd>
            {request.cargoDescription} · {request.volumes} {t('detail.volumes')} ·{' '}
            {request.weightKg} kg
          </dd>
        </div>
        <div>
          <dt>{t('detail.contact')}</dt>
          <dd>{[request.requesterEmail, request.requesterPhone].filter(Boolean).join(' · ')}</dd>
        </div>
        {request.originContactName === null && request.originContactPhone === null ? null : (
          <div>
            <dt>{t('detail.originContact')}</dt>
            <dd>
              {[request.originContactName, request.originContactPhone].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}
        {request.destinationContactName === null &&
        request.destinationContactPhone === null ? null : (
          <div>
            <dt>{t('detail.destinationContact')}</dt>
            <dd>
              {[request.destinationContactName, request.destinationContactPhone]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        )}
        {request.accessNotes === null ? null : (
          <div>
            <dt>{t('detail.accessNotes')}</dt>
            <dd>{request.accessNotes}</dd>
          </div>
        )}
        {request.cargoValue === null ? null : (
          <div>
            <dt>{t('detail.cargoValue')}</dt>
            <dd>R$ {request.cargoValue}</dd>
          </div>
        )}
        {request.quotedTotalAmount === null ? null : (
          <div>
            <dt>{t('detail.quoted')}</dt>
            <dd>R$ {request.quotedTotalAmount}</dd>
          </div>
        )}
        {request.note === null ? null : (
          <div>
            <dt>{t('detail.note')}</dt>
            <dd>{request.note}</dd>
          </div>
        )}
        {request.decisionNote === null ? null : (
          <div>
            <dt>{t('detail.decisionNote')}</dt>
            <dd>{request.decisionNote}</dd>
          </div>
        )}
      </dl>

      {DECIDABLE.includes(request.status) ? (
        <div className={styles.actions}>
          <Button onClick={() => setMode('accept')} type="button">
            {t('actions.accept')}
          </Button>
          <Button onClick={() => setMode('refuse')} type="button" variant="secondary">
            {t('actions.refuse')}
          </Button>
        </div>
      ) : null}

      {mode === 'accept' ? (
        <div className={styles.form}>
          <div className={styles.field}>
            <span>{t('accept.start')}</span>
            <DatePicker
              {...calendar}
              ariaLabel={t('accept.start')}
              onChange={setStart}
              value={start}
            />
          </div>
          <div className={styles.field}>
            <span>{t('accept.end')}</span>
            <DatePicker {...calendar} ariaLabel={t('accept.end')} onChange={setEnd} value={end} />
          </div>
          <label className={styles.field}>
            <span>{t('accept.amount')}</span>
            <input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </label>
          <label className={styles.field}>
            <span>{t('accept.note')}</span>
            <input
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>
          <Button
            disabled={actions.accept.isPending}
            onClick={() =>
              actions.accept.mutate(
                {
                  id: request.id,
                  values: {
                    acceptedTotalAmount:
                      amount.trim() === '' ? null : amount.trim().replace(',', '.'),
                    acceptedWindowEnd: end === '' ? null : end,
                    acceptedWindowStart: start === '' ? null : start,
                    note: note.trim() === '' ? null : note.trim(),
                  },
                },
                { onSuccess: () => setMode(null) },
              )
            }
            type="button"
          >
            {t('accept.confirm')}
          </Button>
        </div>
      ) : null}

      {mode === 'refuse' ? (
        <div className={styles.form}>
          <label className={styles.field}>
            <span>{t('refuse.note')}</span>
            <input
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>
          <Button
            disabled={actions.refuse.isPending || note.trim() === ''}
            onClick={() =>
              actions.refuse.mutate(
                { id: request.id, note: note.trim() },
                { onSuccess: () => setMode(null) },
              )
            }
            type="button"
          >
            {t('refuse.confirm')}
          </Button>
        </div>
      ) : null}

      {request.status === 'accepted' && suggestion !== null ? (
        <div className={styles.suggestion}>
          <h3>{t('suggestion.title')}</h3>
          <p className={styles.hint}>{t('suggestion.hint')}</p>
          {suggestion.trips.length === 0 ? (
            <p className={styles.hint}>{t('suggestion.none')}</p>
          ) : null}
          {suggestion.trips.map((trip) => (
            <div className={styles.suggestionRow} key={trip.id}>
              <span>
                {t('suggestion.trip', { stops: trip.stopCount })} ·{' '}
                {t(`suggestion.tripStatus.${trip.status}`, { defaultValue: trip.status })}
              </span>
              <Button
                disabled={actions.schedule.isPending}
                onClick={() => actions.schedule.mutate({ id: request.id, tripId: trip.id })}
                type="button"
                variant="secondary"
              >
                {t('suggestion.join')}
              </Button>
            </div>
          ))}
          {suggestion.canCreateNewTrip ? (
            <Button
              onClick={() => {
                window.location.assign('/trips')
              }}
              type="button"
              variant="secondary"
            >
              {t('suggestion.createTrip')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {request.tripId === null ? null : <p className={styles.hint}>{t('detail.linkedTrip')}</p>}
      {failureCode === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${failureCode}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}
    </section>
  )
}
