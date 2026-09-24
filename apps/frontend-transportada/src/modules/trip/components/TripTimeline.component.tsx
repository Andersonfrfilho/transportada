/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { useTripOccurrenceAttachmentsQuery } from '../queries/tripOccurrenceFeed.query'
import type { TripTimelineItem, TripTimelinePage } from '../shared/trip.types'
import { resolveTripTimelineAvatar } from '../shared/tripTimelineAvatar.service'
import { hasTripTimelineExpandableDetail } from '../shared/tripTimelineDetail.service'
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
import {
  resolveTripTimelineDocumentHref,
  resolveTripTimelineStopHref,
} from '../shared/tripTimelineLink.service'
import styles from '../styles/tripTimeline.module.css'
import { OccurrenceAttachmentGrid } from './OccurrenceAttachmentGrid.component'

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
  const translate = t as Translate
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
          {items.map((item, index) => (
            <TripTimelineEntry
              item={item}
              key={item.id}
              repeatsAuthorship={
                index > 0 &&
                resolveTripTimelineAuthorshipText(
                  items[index - 1] as TripTimelineItem,
                  translate,
                ) === resolveTripTimelineAuthorshipText(item, translate)
              }
            />
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

function TripTimelineEntry({
  item,
  repeatsAuthorship,
}: Readonly<{ item: TripTimelineItem; repeatsAuthorship: boolean }>) {
  const { t } = useTranslation('trip')
  const translate = t as Translate
  const [isExpanded, setIsExpanded] = useState(false)
  const hasDetail = hasTripTimelineExpandableDetail(item)
  const detailId = `trip-timeline-detail-${item.id}`
  const title = resolveTripTimelineTitle(item, translate)
  const authorship = resolveTripTimelineAuthorshipText(item, translate)
  const avatar = resolveTripTimelineAvatar(item)
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
  const titleHref =
    item.document !== null
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
    <li className={cn(styles.item, styles.itemEnter, TONE_CLASS[resolveTripTimelineTone(item)])}>
      <div className={styles.itemHead}>
        {/**
         * Spec 180 RF9-RF11 (CA08/CA09): o avatar é o próprio selo visual de autoria — nasce do
         * `actorName` que o item já publica, nunca de uma foto ou id. `aria-hidden`: o texto de
         * autoria ao lado já diz o nome por extenso, e repeti-lo para leitor de tela seria ruído.
         */}
        {avatar === null ? null : (
          <span
            aria-hidden="true"
            className={cn(styles.avatar, styles[`avatarPalette${avatar.paletteIndex}`])}
          >
            {avatar.initials}
          </span>
        )}
        <div className={styles.itemHeadText}>
          {/*
           * Spec 180 RF15: o **título** leva à coisa citada, em vez de uma linha de "Ver nota · Ver
           * parada" repetida em todo evento — oito pares idênticos empilhados competiam com os
           * títulos, que é o que se lê. A nota manda; sem nota, a parada. Evento que não cita nem
           * uma nem outra continua texto puro, sem link morto.
           */}
          <p className={styles.itemTitle}>
            {titleHref === null ? (
              title
            ) : (
              <a className={styles.itemTitleLink} href={titleHref}>
                {title}
              </a>
            )}
          </p>
          <p className={styles.itemMeta}>
            <time className={styles.itemTime} dateTime={item.occurredAt}>
              {formatMoment(item.occurredAt)}
            </time>
            {/*
             * A autoria se repete evento após evento — numa viagem tocada pelo mesmo operador ela
             * aparecia oito vezes, quase tão longa quanto o título, competindo com ele. Só aparece
             * quando **muda** em relação ao evento anterior; igual, o leitor já sabe de quem é.
             */}
            {authorship === null || repeatsAuthorship ? null : (
              <span className={styles.itemAuthorship}>{authorship}</span>
            )}
            {item.recordedAt === null ? null : (
              <span className={styles.itemRecorded}>
                {t('eventTimeline.recordedAt', { moment: formatMoment(item.recordedAt) })}
              </span>
            )}
          </p>
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
          {isExpanded ? t('eventTimeline.collapse') : t('eventTimeline.expand')}
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
