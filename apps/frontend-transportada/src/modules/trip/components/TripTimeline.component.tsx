/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { useTripOccurrenceAttachmentsQuery } from '../queries/tripOccurrenceFeed.query'
import type { TripStopDetail, TripTimelineItem, TripTimelinePage } from '../shared/trip.types'
import { resolveTripTimelineAddressChange } from '../shared/tripTimelineAddressChange.service'
import {
  hasTripTimelineExpandableDetail,
  resolveTimelineLocationView,
} from '../shared/tripTimelineDetail.service'
import {
  collectRepeatedAuthorshipItemIds,
  collectTripTimelineDocuments,
  filterTripTimelineItemsByDocumentIds,
  formatTripTimelineDocumentFilterLabel,
  groupTripTimelineItemsByDay,
  removeDuplicateDispatchEvents,
  removeDuplicateTimelineItems,
  resolveTripTimelineAuthorshipText,
  resolveTripTimelineTitle,
} from '../shared/tripTimeline.service'
import {
  resolveTripTimelineDocumentHref,
  resolveTripTimelineOccurrenceHref,
  resolveTripTimelineStopHref,
} from '../shared/tripTimelineLink.service'
import { navigateToTripOccurrence } from '../shared/tripOccurrenceRoute.service'
import {
  formatTripTimelineDuration,
  resolveTripTimelineChips,
  resolveTripTimelineIcon,
  resolveTripTimelineInterval,
  type TripTimelineIconTone,
} from '../shared/tripTimelineRow.service'
import styles from '../styles/tripTimeline.module.css'
import { OccurrenceAttachmentGrid } from './OccurrenceAttachmentGrid.component'
import { TripTimelineLocation } from './TripTimelineLocation.component'
import {
  TripTimelineLocationMap,
  type TripTimelineLocationMapStop,
} from './TripTimelineLocationMap.component'
import { TripTimelineMiniMap } from './TripTimelineMiniMap.component'

const SKELETON_ROWS = 3

const EVENT_MAP_PANEL_ID = 'trip-timeline-event-map'

const ICON_TONE_CLASS: Readonly<Record<TripTimelineIconTone, string | undefined>> = {
  done: styles.iconDone,
  neutral: styles.iconNeutral,
  problem: styles.iconProblem,
  progress: styles.iconProgress,
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  weekday: 'long',
  year: 'numeric',
})

const MILLISECONDS_PER_DAY = 86_400_000

function midnightOf(moment: Date): number {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime()
}

/** `dayKey` é data local (`YYYY-MM-DD`); `new Date('2026-09-23')` seria UTC e voltaria um dia. */
function parseDayKey(dayKey: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (parts === null) return null
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
}

function resolveDayLabel(dayKey: string, t: Translate): string {
  const day = parseDayKey(dayKey)
  if (day === null) return dayKey
  const distance = Math.round((midnightOf(new Date()) - day.getTime()) / MILLISECONDS_PER_DAY)
  if (distance === 0) return t('eventTimeline.day.today')
  if (distance === 1) return t('eventTimeline.day.yesterday')
  return dayFormatter.format(day)
}

function formatTime(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : timeFormatter.format(moment)
}

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
  /** As paradas da viagem: o mapa do ponto do evento desenha também a parada. Ausente, só o evento. */
  stops?: readonly TripStopDetail[] | undefined
}>

function findStopForMap(
  item: TripTimelineItem,
  stops: readonly TripStopDetail[] | undefined,
): null | TripTimelineLocationMapStop {
  if (item.stop === null || stops === undefined) return null
  const stop = stops.find((candidate) => candidate.id === item.stop?.id)
  if (stop === undefined) return null
  const latitude = Number(stop.latitude ?? Number.NaN)
  const longitude = Number(stop.longitude ?? Number.NaN)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    label: stop.label,
    latitude,
    longitude,
    sequence: stop.sequence,
    stopKey: stop.addressKey,
  }
}

/**
 * Spec 158 T8 (RF6) / T10: a seção "Linha do tempo" do detalhe da viagem — trilho vertical com um
 * marcador por evento (tom de conclusão/problema/andamento), título forte e uma linha discreta com
 * horário e autoria. Sem cartão por item: numa viagem de 50 notas a borda cheia de cada um pesava.
 * A ordem é a da API (D4, do mais recente para o mais antigo) — o componente não reordena.
 */
export function TripTimeline({ openDocumentId, query, stops }: TripTimelineProps) {
  const { t } = useTranslation('trip')
  const translate = t as Translate
  /**
   * Spec 180 RF12: começa filtrando pela nota que a navegação abriu, quando houve uma — era o que o
   * checkbox de uma nota só fazia —, e daí o operador escolhe outras.
   */
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<ReadonlySet<string>>(
    () => new Set(openDocumentId === null ? [] : [openDocumentId]),
  )
  const [isEventMapExpanded, setIsEventMapExpanded] = useState(false)

  const loadedItems = useMemo(() => {
    const pages = query.data?.pages ?? []
    return removeDuplicateDispatchEvents(
      removeDuplicateTimelineItems(pages.flatMap((page) => page.items)),
    )
  }, [query.data])

  const documents = useMemo(() => collectTripTimelineDocuments(loadedItems), [loadedItems])
  const items = useMemo(
    () => filterTripTimelineItemsByDocumentIds(loadedItems, selectedDocumentIds),
    [loadedItems, selectedDocumentIds],
  )
  /** A API ordena do mais recente para o mais antigo: o evento anterior é o próximo da lista. */
  const olderItemById = useMemo(
    () => new Map(items.map((item, index) => [item.id, items[index + 1]])),
    [items],
  )
  const repeatedAuthorshipItemIds = useMemo(
    () => collectRepeatedAuthorshipItemIds(items, translate),
    [items, translate],
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

      {/**
       * Spec 196: o mapa dos eventos media 533px aberto por padrão — a lista inteira nascia abaixo
       * da dobra por causa de algo que ninguém tinha pedido ainda. O painel existe fechado, para o
       * `aria-controls` ter destino; o mapa só é construído depois do gesto.
       */}
      {items.length > 0 ? (
        <Fragment>
          <Button
            aria-controls={EVENT_MAP_PANEL_ID}
            aria-expanded={isEventMapExpanded}
            className={styles.action}
            onClick={() => setIsEventMapExpanded((current) => !current)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={isEventMapExpanded ? 'chevron-up' : 'chevron-down'} />
            {isEventMapExpanded ? t('eventTimeline.map.hide') : t('eventTimeline.map.show')}
          </Button>
          <div className={styles.mapPanel} id={EVENT_MAP_PANEL_ID}>
            {isEventMapExpanded ? (
              <TripTimelineMiniMap hasMorePages={query.hasNextPage} items={items} />
            ) : null}
          </div>
        </Fragment>
      ) : null}

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
        <div aria-busy={query.isFetchingNextPage} className={styles.days}>
          {groupTripTimelineItemsByDay(items).map((group) => (
            <section className={styles.day} key={group.dayKey}>
              <h4 className={styles.dayLabel}>
                {resolveDayLabel(group.dayKey, translate)}
                <span className={styles.dayCount}>
                  {t('eventTimeline.day.count', { count: group.items.length })}
                </span>
              </h4>
              <ol className={styles.list}>
                {group.items.map((item, index) => {
                  const older = olderItemById.get(item.id)
                  const interval =
                    older === undefined
                      ? undefined
                      : resolveTripTimelineInterval({ newer: item, older })
                  const hasGapRuler = interval?.kind === 'gap' && index < group.items.length - 1
                  return (
                    <Fragment key={item.id}>
                      <TripTimelineEntry
                        elapsedMinutes={
                          interval === undefined || interval.kind === 'none' || hasGapRuler
                            ? null
                            : interval.minutes
                        }
                        item={item}
                        repeatsAuthorship={repeatedAuthorshipItemIds.has(item.id)}
                        stops={stops}
                      />
                      {hasGapRuler ? (
                        <li className={styles.gap}>
                          {t('eventTimeline.gap', {
                            duration: formatTripTimelineDuration(interval.minutes, translate),
                          })}
                        </li>
                      ) : null}
                    </Fragment>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
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

/**
 * `isOwnDelivery` (spec 227 D11): a linha aparece dentro da própria nota — o `departed` ali é a saída
 * **para esta parada**, e o título não aponta de volta para a nota em que já está.
 */
export function TripTimelineEntry({
  elapsedMinutes,
  isOwnDelivery = false,
  item,
  repeatsAuthorship,
  stops,
}: Readonly<{
  elapsedMinutes: null | number
  isOwnDelivery?: boolean
  item: TripTimelineItem
  repeatsAuthorship: boolean
  stops: readonly TripStopDetail[] | undefined
}>) {
  const { t } = useTranslation('trip')
  const translate = t as Translate
  const [isExpanded, setIsExpanded] = useState(false)
  const hasDetail = hasTripTimelineExpandableDetail(item)
  const locationView = resolveTimelineLocationView(item, translate)
  /** Quando o mapa é o único detalhe, o botão diz o que abre em vez de "Ver mais". */
  const isMapOnlyDetail =
    locationView?.canViewMap === true &&
    !hasTripTimelineExpandableDetail({ ...item, location: null, locationState: null })
  const detailId = `trip-timeline-detail-${item.id}`
  const mapPanelId = `trip-timeline-map-${item.id}`
  const eventMap =
    locationView?.coordinates == null ? null : (
      <TripTimelineLocationMap
        eventLatitude={locationView.coordinates.latitude}
        eventLongitude={locationView.coordinates.longitude}
        stop={findStopForMap(item, stops)}
      />
    )
  const title =
    isOwnDelivery && item.kind === 'stop.departed'
      ? t('eventTimeline.itemTitle.stopDepartedForThisStop')
      : resolveTripTimelineTitle(item, translate)
  /** Autoria igual à do evento anterior cala: o leitor já sabe de quem é (spec 180). */
  const authorship = repeatsAuthorship ? null : resolveTripTimelineAuthorshipText(item, translate)
  const { icon, tone } = resolveTripTimelineIcon(item)
  const chips = resolveTripTimelineChips(item, translate)
  const addressChange = resolveTripTimelineAddressChange(item, translate)
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
  /**
   * Spec 180 RF15: a nota manda sobre a parada — o evento fala de uma nota específica, e a parada é
   * onde ela estava. Sem nenhuma das duas, não há link: título que não leva a lugar nenhum é pior
   * que título simples.
   */
  /**
   * Spec 183 T204: a ocorrência ganhou página própria — o evento de ocorrência leva a ela (o id do
   * evento **é** o da ocorrência nas duas fontes), e não mais à nota ou à parada.
   */
  const isOccurrenceEvent = item.kind === 'stop.occurrence' || item.kind === 'document.occurrence'
  const titleHref = isOccurrenceEvent
    ? resolveTripTimelineOccurrenceHref(item.id)
    : isOwnDelivery
      ? null
      : item.document !== null
        ? resolveTripTimelineDocumentHref(item.document.id)
        : item.stop !== null
          ? resolveTripTimelineStopHref(item.stop.id)
          : null
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
    <li className={cn(styles.item, styles.itemEnter)}>
      <div className={styles.itemHead}>
        <span aria-hidden="true" className={cn(styles.icon, ICON_TONE_CLASS[tone])}>
          <Icon name={icon} />
        </span>
        <div className={styles.itemHeadText}>
          {/*
           * Spec 180 RF15: o **título** leva à coisa citada, em vez de uma linha de "Ver nota · Ver
           * parada" repetida em todo evento — oito pares idênticos empilhados competiam com os
           * títulos, que é o que se lê. A nota manda; sem nota, a parada. Evento que não cita nem
           * uma nem outra continua texto puro, sem link morto.
           */}
          <div className={styles.itemTitleRow}>
            <p className={styles.itemTitle}>
              {titleHref === null ? (
                title
              ) : (
                <a
                  className={styles.itemTitleLink}
                  href={titleHref}
                  onClick={
                    isOccurrenceEvent
                      ? (event) => {
                          /** Sem router: a troca de página é `pushState`, sem recarregar o app. */
                          event.preventDefault()
                          navigateToTripOccurrence({
                            navigator: createBrowserWorkspaceNavigator(),
                            occurrenceId: item.id,
                          })
                        }
                      : undefined
                  }
                >
                  {title}
                </a>
              )}
            </p>
            <time
              className={styles.itemTime}
              dateTime={item.occurredAt}
              title={formatMoment(item.occurredAt)}
            >
              {formatTime(item.occurredAt)}
            </time>
          </div>
          {chips.length === 0 ? null : (
            <ul className={styles.itemChips}>
              {chips.map((chip) => (
                <li key={chip.id}>
                  <Badge
                    title={
                      chip.id === 'late' && item.recordedAt !== null
                        ? t('eventTimeline.recordedAt', { moment: formatMoment(item.recordedAt) })
                        : undefined
                    }
                    variant={chip.tone === 'copper' ? 'warning' : 'secondary'}
                  >
                    {chip.label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {authorship === null &&
          elapsedMinutes === null &&
          locationView === null &&
          addressChange === null ? null : (
            <div className={styles.itemMeta}>
              {addressChange === null ? null : <span>{addressChange.origin}</span>}
              {addressChange?.displacement == null ? null : (
                <span>{addressChange.displacement}</span>
              )}
              {authorship === null ? null : (
                <span className={styles.itemAuthorship}>{authorship}</span>
              )}
              {elapsedMinutes === null ? null : (
                <span>
                  {t('eventTimeline.afterPrevious', {
                    duration: formatTripTimelineDuration(elapsedMinutes, translate),
                  })}
                </span>
              )}
              {locationView === null ? null : <TripTimelineLocation view={locationView} />}
            </div>
          )}
        </div>
      </div>
      {/**
       * Spec 180 RF16/CA14/CA16: só oferece expandir quando `hasTripTimelineExpandableDetail`
       * confirma que há algo a mostrar — o controle nunca abre o vazio.
       */}
      {hasDetail ? (
        <Button
          aria-controls={detailId}
          aria-expanded={isExpanded}
          className={styles.itemToggle}
          onClick={() => setIsExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
          {isMapOnlyDetail
            ? isExpanded
              ? t('eventTimeline.location.hideMap')
              : t('eventTimeline.location.viewMap')
            : isExpanded
              ? t('eventTimeline.collapse')
              : t('eventTimeline.expand')}
        </Button>
      ) : null}
      {hasDetail && isExpanded ? (
        <div className={styles.itemDetailGroup} id={detailId}>
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
          {occurrenceNote === null ? null : (
            <p className={styles.itemDetail}>
              {t('eventTimeline.occurrenceNote', { note: occurrenceNote })}
            </p>
          )}
          {eventMap === null ? null : isMapOnlyDetail ? (
            eventMap
          ) : (
            <TripTimelineEventMapDisclosure map={eventMap} panelId={mapPanelId} />
          )}
          {attachmentCount === null ? null : (
            <TripTimelineOccurrenceAttachments
              occurrenceCreatedAt={item.occurredAt}
              occurrenceId={item.id}
            />
          )}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Spec 196: o mapa do evento custava 312px dentro do "Ver mais" para entregar, no evento de
 * devolução, uma linha de texto — quem só queria ler o motivo pagava o mapa inteiro. Ele passa a
 * abrir num segundo gesto, mas **só onde há texto junto**: quando a posição é tudo o que o evento
 * tem, o próprio "Ver mais" já se chama "Ver no mapa", e repetir o rótulo dentro do painel seria um
 * controle que abre outro controle de mesmo nome. Esse caso fica com um gesto só.
 */
function TripTimelineEventMapDisclosure({
  map,
  panelId,
}: Readonly<{ map: ReactNode; panelId: string }>) {
  const { t } = useTranslation('trip')
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Fragment>
      <Button
        aria-controls={panelId}
        aria-expanded={isExpanded}
        className={styles.detailMapToggle}
        onClick={() => setIsExpanded((current) => !current)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
        {isExpanded ? t('eventTimeline.location.hideMap') : t('eventTimeline.location.viewMap')}
      </Button>
      <div className={styles.mapPanel} id={panelId}>
        {isExpanded ? map : null}
      </div>
    </Fragment>
  )
}

/**
 * Spec 180 RF5/RF6/RF18 (CA05/CA15): busca os anexos só quando o item expande — o `item.id` do
 * evento de ocorrência **é** o id da própria ocorrência (D6), então não há join novo para achar a
 * rota. Mesmo padrão de `OccurrenceAttachments` em `TripOccurrenceTable.component.tsx`: esqueleto
 * até a resposta chegar, grade silenciosa quando o resultado vem vazio (CA05, "sem anexo não
 * mostra grade vazia") — a retenção expirada é assunto da própria grade, que já marca a foto
 * vencida sem gerar URL.
 */
function TripTimelineOccurrenceAttachments({
  occurrenceCreatedAt,
  occurrenceId,
}: Readonly<{ occurrenceCreatedAt: string; occurrenceId: string }>) {
  const attachmentsQuery = useTripOccurrenceAttachmentsQuery({ enabled: true, occurrenceId })

  if (attachmentsQuery.isLoading) return <Skeleton height="5rem" width="7rem" />
  const attachments = attachmentsQuery.data ?? []
  if (attachments.length === 0) return null

  return (
    <OccurrenceAttachmentGrid
      attachments={attachments}
      occurrenceCreatedAt={occurrenceCreatedAt}
      onRefresh={async () => (await attachmentsQuery.refetch()).data ?? []}
    />
  )
}
