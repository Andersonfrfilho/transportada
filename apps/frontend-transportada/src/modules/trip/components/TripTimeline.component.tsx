/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripTimelineItem, TripTimelinePage } from '../shared/trip.types'
import {
  collectTripTimelineDocuments,
  filterTripTimelineItemsByDocumentIds,
  formatTripTimelineDocumentFilterLabel,
  removeDuplicateDispatchEvents,
  resolveTripTimelineAuthorshipText,
  resolveTripTimelineTitle,
  resolveTripTimelineTone,
  type TripTimelineTone,
} from '../shared/tripTimeline.service'
import styles from '../styles/tripTimeline.module.css'

const SKELETON_ROWS = 3

const TONE_CLASS: Readonly<Record<TripTimelineTone, string | undefined>> = {
  done: styles.itemDone,
  problem: styles.itemProblem,
  progress: undefined,
}

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
 * Spec 158 T8 (RF6) / T10: a seção "Linha do tempo" do detalhe da viagem — trilho vertical com um
 * marcador por evento (tom de conclusão/problema/andamento), título forte e uma linha discreta com
 * horário e autoria. Sem cartão por item: numa viagem de 50 notas a borda cheia de cada um pesava.
 * A ordem é a da API (D4, do mais recente para o mais antigo) — o componente não reordena.
 */
export function TripTimeline({ openDocumentId, query }: TripTimelineProps) {
  const { t } = useTranslation('trip')
  /**
   * Spec 180 RF12: começa filtrando pela nota que a navegação abriu, quando houve uma — era o que o
   * checkbox de uma nota só fazia —, e daí o operador escolhe outras.
   */
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<ReadonlySet<string>>(
    () => new Set(openDocumentId === null ? [] : [openDocumentId]),
  )

  const loadedItems = useMemo(() => {
    const pages = query.data?.pages ?? []
    return removeDuplicateDispatchEvents(pages.flatMap((page) => page.items))
  }, [query.data])

  const documents = useMemo(() => collectTripTimelineDocuments(loadedItems), [loadedItems])
  const items = useMemo(
    () => filterTripTimelineItemsByDocumentIds(loadedItems, selectedDocumentIds),
    [loadedItems, selectedDocumentIds],
  )

  function handleDocumentToggle(documentId: string, checked: boolean) {
    setSelectedDocumentIds((current) => {
      const next = new Set(current)
      if (checked) next.add(documentId)
      else next.delete(documentId)
      return next
    })
  }

  return (
    <section aria-labelledby="trip-timeline-title" className={styles.section}>
      <div className={styles.head}>
        <h3 id="trip-timeline-title">{t('eventTimeline.title')}</h3>
        {documents.length === 0 ? null : (
          <fieldset className={styles.documentFilter}>
            <legend className={styles.documentFilterLegend}>
              {t('eventTimeline.filterByDocument')}
            </legend>
            {documents.map((document) => (
              <Checkbox
                checked={selectedDocumentIds.has(document.id)}
                key={document.id}
                label={formatTripTimelineDocumentFilterLabel(document, t as Translate)}
                onChange={(checked) => handleDocumentToggle(document.id, checked)}
              />
            ))}
          </fieldset>
        )}
      </div>

      {query.isPending ? (
        <SkeletonGroup className={styles.skeleton} label={t('eventTimeline.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div className={styles.skeletonRow} key={index}>
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="70%" />
            </div>
          ))}
        </SkeletonGroup>
      ) : query.isError ? (
        <div className={styles.error} role="alert">
          <p>{t('eventTimeline.error')}</p>
          <Button
            className={styles.action}
            onClick={query.refetch}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="refresh" />
            {t('eventTimeline.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className={styles.hint}>{t('eventTimeline.empty')}</p>
      ) : (
        <ol aria-busy={query.isFetchingNextPage} className={styles.list}>
          {items.map((item) => (
            <TripTimelineEntry item={item} key={item.id} />
          ))}
        </ol>
      )}

      {query.hasNextPage ? (
        <Button
          className={styles.action}
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
  const authorship = resolveTripTimelineAuthorshipText(item, translate)
  const occurrenceNote =
    (item.kind === 'stop.occurrence' || item.kind === 'document.occurrence') &&
    item.occurrence !== null &&
    item.occurrence.note !== ''
      ? item.occurrence.note
      : null
  /** RF12: só marca e conta — nenhuma URL assinada nasce na listagem. Quem quer ver abre a
   * ocorrência. */
  const attachmentCount =
    (item.kind === 'stop.occurrence' || item.kind === 'document.occurrence') &&
    item.occurrence !== null &&
    item.occurrence.attachmentCount !== undefined &&
    item.occurrence.attachmentCount > 0
      ? item.occurrence.attachmentCount
      : null
  /**
   * `returnReason` é código (`recipient_refused`), não texto: o dicionário vive em
   * `fieldActions.returnReason` e a tela do motorista já o usa. A linha do tempo mostrava o código
   * cru em inglês. Código sem tradução — há `'migration'` legado no banco — cai no próprio código,
   * que é feio mas verdadeiro; some-lo esconderia o motivo da devolução.
   */
  const returnReasonCode =
    item.kind === 'document.returned' && item.returnReason !== null && item.returnReason !== ''
      ? item.returnReason
      : null
  const returnReason =
    returnReasonCode === null
      ? null
      : t(`fieldActions.returnReason.${returnReasonCode}`, { defaultValue: returnReasonCode })
  const closeReason =
    item.kind === 'trip.status_changed' &&
    item.toStatus === 'completed' &&
    item.closeReason !== null &&
    item.closeReason !== ''
      ? item.closeReason
      : null

  return (
    <li className={cn(styles.item, styles.itemEnter, TONE_CLASS[resolveTripTimelineTone(item)])}>
      <p className={styles.itemTitle}>{title}</p>
      <p className={styles.itemMeta}>
        <time className={styles.itemTime} dateTime={item.occurredAt}>
          {formatMoment(item.occurredAt)}
        </time>
        {authorship === null ? null : <span className={styles.itemAuthorship}>{authorship}</span>}
        {item.recordedAt === null ? null : (
          <span className={styles.itemRecorded}>
            {t('eventTimeline.recordedAt', { moment: formatMoment(item.recordedAt) })}
          </span>
        )}
      </p>
      {returnReason === null ? null : (
        <p className={styles.itemDetail}>
          {t('eventTimeline.returnReason', { reason: returnReason })}
        </p>
      )}
      {closeReason === null ? null : (
        <p className={styles.itemDetail}>
          {t('eventTimeline.closeReason', { reason: closeReason })}
        </p>
      )}
      {occurrenceNote === null ? null : <p className={styles.itemDetail}>{occurrenceNote}</p>}
      {attachmentCount === null ? null : (
        <p className={styles.itemDetail}>
          <Icon name="camera" />
          {t('eventTimeline.attachmentCount', { count: attachmentCount })}
        </p>
      )}
    </li>
  )
}
