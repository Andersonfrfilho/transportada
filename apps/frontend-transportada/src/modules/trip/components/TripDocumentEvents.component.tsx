/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { useTripDocumentTimelineQuery } from '../queries/useTripDocumentTimeline.query'
import { canReadTrip } from '../shared/trip.constant'
import type { TripStopDetail } from '../shared/trip.types'
import {
  collectRepeatedAuthorshipItemIds,
  removeDuplicateDispatchEvents,
  removeDuplicateTimelineItems,
} from '../shared/tripTimeline.service'
import { resolveTripTimelineInterval } from '../shared/tripTimelineRow.service'
import timelineStyles from '../styles/tripTimeline.module.css'
import styles from '../styles/trip.module.css'

import { TripTimelineEntry } from './TripTimeline.component'

type TripDocumentEventsProps = Readonly<{
  documentId: string
  permissions: readonly string[]
  /** Spec 233 D6: o raio que valeu para o comprovante. Ausente, nenhum raio é escrito — nunca um número suposto. */
  proofRadiusMeters?: number | undefined
  stops?: readonly TripStopDetail[] | undefined
  tripId: string
}>

const SKELETON_ROWS = 2

/**
 * Spec 233 T5.3 (RF7, D11): "Eventos desta entrega" na nota aberta — os eventos **da nota** e os da
 * parada dela, vindos de `GET /trips/:id/timeline?documentId=`. A apresentação de cada evento é a
 * `TripTimelineEntry` da linha do tempo da viagem (distância ao ponto e mapa só com
 * `trip.event-location`, que a API já aplica). Em ordem cronológica, como no canvas.
 */
export function TripDocumentEvents({
  documentId,
  permissions,
  proofRadiusMeters,
  stops,
  tripId,
}: TripDocumentEventsProps) {
  const { t } = useTranslation('trip')
  const translate = t as Translate
  const query = useTripDocumentTimelineQuery({ documentId, permissions, tripId })

  /** A API ordena do mais recente para o mais antigo; a seção conta a entrega do começo ao fim. */
  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    return removeDuplicateDispatchEvents(
      removeDuplicateTimelineItems(pages.flatMap((page) => page.items)),
    ).toReversed()
  }, [query.data])
  const repeatedAuthorshipItemIds = useMemo(
    () => collectRepeatedAuthorshipItemIds(items, translate),
    [items, translate],
  )

  /** A seção é de uma entrega: se todo evento é da mesma parada, o chip dela é ruído em cada linha. */
  const sharesStop = items.every((item) => item.stop?.id === items[0]?.stop?.id)

  if (!canReadTrip(permissions)) return null

  return (
    <section aria-labelledby={`trip-document-events-${documentId}`} className={styles.documentData}>
      <h4 className={styles.documentDataTitle} id={`trip-document-events-${documentId}`}>
        {t('eventTimeline.document.title')}
      </h4>
      {query.isPending ? (
        <SkeletonGroup label={t('eventTimeline.document.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} variant="text" width="70%" />
          ))}
        </SkeletonGroup>
      ) : query.isError ? (
        <div role="alert">
          <p>{t('eventTimeline.document.error')}</p>
          <Button onClick={() => void query.refetch()} size="sm" type="button" variant="ghost">
            <Icon name="refresh" />
            {t('eventTimeline.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className={timelineStyles.hint}>{t('eventTimeline.document.empty')}</p>
      ) : (
        <ol aria-busy={query.isFetchingNextPage} className={timelineStyles.list}>
          {items.map((item, index) => {
            const previous = items[index - 1]
            const interval =
              previous === undefined
                ? undefined
                : resolveTripTimelineInterval({ newer: item, older: previous })
            return (
              <TripTimelineEntry
                elapsedMinutes={
                  interval === undefined || interval.kind === 'none' ? null : interval.minutes
                }
                isOwnDelivery
                item={item}
                key={item.id}
                repeatsAuthorship={repeatedAuthorshipItemIds.has(item.id)}
                shouldOmitStopChip={sharesStop}
                stops={stops}
              />
            )
          })}
        </ol>
      )}
      {query.hasNextPage ? (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-down" />
          {query.isFetchingNextPage ? t('eventTimeline.loadingMore') : t('eventTimeline.loadMore')}
        </Button>
      ) : null}
      {proofRadiusMeters === undefined ? null : (
        <p className={timelineStyles.hint}>
          {t('eventTimeline.document.radius', { meters: proofRadiusMeters })}
        </p>
      )}
    </section>
  )
}
