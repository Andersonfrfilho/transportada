/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveFieldAuthorshipText } from '../shared/fieldAuthorship.service'
import type { TripTimelineItem, TripTimelinePage } from '../shared/trip.types'
import {
  filterTripTimelineItemsByDocumentId,
  removeDuplicateDispatchEvents,
  resolveTripTimelineTitle,
} from '../shared/tripTimeline.service'
import styles from '../styles/tripTimeline.module.css'

const SKELETON_ROWS = 3

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : dateTimeFormatter.format(moment)
}

export type TripTimelineQuery = Readonly<{
  data?: Readonly<{ pages: readonly TripTimelinePage[] }> | undefined
  fetchNextPage: () => void
  hasNextPage: boolean
  isError: boolean
  isFetchingNextPage: boolean
  isPending: boolean
  refetch: () => void
}>

type TripTimelineProps = Readonly<{
  /** Nota aberta no detalhe (spec 158 RF6) — `null` quando nenhuma está aberta, e o filtro some. */
  openDocumentId: null | string
  query: TripTimelineQuery
}>

/**
 * Spec 158 T8 (RF6): a seção "Linha do tempo" do detalhe da viagem. Sem CSS órfão de spec 110 — a
 * linha do tempo de rota (trilho, praças, pagamento) é um desenho diferente deste, uma lista
 * cronológica de eventos com autoria, no molde de `NfeDocumentEventHistoryDrawer`/
 * `CteIssuanceStatusPanel`.
 */
export function TripTimeline({ openDocumentId, query }: TripTimelineProps) {
  const { t } = useTranslation('trip')
  const [onlyOpenDocument, setOnlyOpenDocument] = useState(false)

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    const merged = pages.flatMap((page) => page.items)
    const withoutDuplicateDispatch = removeDuplicateDispatchEvents(merged)
    return filterTripTimelineItemsByDocumentId(
      withoutDuplicateDispatch,
      onlyOpenDocument ? openDocumentId : null,
    )
  }, [onlyOpenDocument, openDocumentId, query.data])

  return (
    <section aria-labelledby="trip-timeline-title" className={styles.section}>
      <div className={styles.head}>
        <h3 id="trip-timeline-title">{t('eventTimeline.title')}</h3>
        {openDocumentId === null ? null : (
          <Checkbox
            checked={onlyOpenDocument}
            label={t('eventTimeline.onlyOpenDocument')}
            onChange={setOnlyOpenDocument}
          />
        )}
      </div>

      {query.isPending ? (
        <SkeletonGroup className={styles.list} label={t('eventTimeline.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div className={styles.item} key={index}>
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="70%" />
            </div>
          ))}
        </SkeletonGroup>
      ) : query.isError ? (
        <div className={styles.error} role="alert">
          <p>{t('eventTimeline.error')}</p>
          <Button onClick={query.refetch} size="sm" type="button" variant="ghost">
            <Icon name="refresh" />
            {t('eventTimeline.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className={styles.hint}>{t('eventTimeline.empty')}</p>
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <TripTimelineEntry item={item} key={item.id} />
          ))}
        </ol>
      )}

      {query.hasNextPage ? (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={query.fetchNextPage}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-down" />
          {query.isFetchingNextPage ? t('eventTimeline.loadingMore') : t('eventTimeline.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}

function TripTimelineEntry({ item }: Readonly<{ item: TripTimelineItem }>) {
  const { t } = useTranslation('trip')
  const translate = t as Translate
  const title = resolveTripTimelineTitle(item, translate)
  const authorship = resolveFieldAuthorshipText(item, translate)
  const occurrenceNote =
    (item.kind === 'stop.occurrence' || item.kind === 'document.occurrence') &&
    item.occurrence !== null &&
    item.occurrence.note !== ''
      ? item.occurrence.note
      : null
  const returnReason =
    item.kind === 'document.returned' && item.returnReason !== null && item.returnReason !== ''
      ? item.returnReason
      : null

  return (
    <li className={styles.item}>
      <p className={styles.itemTitle}>{title}</p>
      <p className={styles.itemMeta}>
        <time className={styles.itemTime} dateTime={item.occurredAt}>
          {formatMoment(item.occurredAt)}
        </time>
        {item.recordedAt === null ? null : (
          <span className={styles.itemRecorded}>
            {' '}
            — {t('eventTimeline.recordedAt', { moment: formatMoment(item.recordedAt) })}
          </span>
        )}
      </p>
      {authorship === null ? null : <p className={styles.itemAuthorship}>{authorship}</p>}
      {returnReason === null ? null : (
        <p className={styles.itemDetail}>
          {t('eventTimeline.returnReason', { reason: returnReason })}
        </p>
      )}
      {occurrenceNote === null ? null : <p className={styles.itemDetail}>{occurrenceNote}</p>}
    </li>
  )
}
