/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import {
  navigateToDriverConversation,
  navigateToDriverStop,
} from '@/modules/shared/driverRoute.service'

import { DriverOccurrenceBadgeIcon } from '../components/DriverOccurrenceBadgeIcon.component'
import { DriverOccurrenceDocumentsPanel } from '../components/DriverOccurrenceDocumentsPanel.component'
import { DriverOccurrenceRow } from '../components/DriverOccurrenceRow.component'
import type { RouteOccurrenceView } from '../hooks/useRouteOccurrenceEntries.hook'
import {
  useOccurrenceShare,
  type OccurrenceShareController,
} from '../hooks/useOccurrenceShare.hook'
import { formatActivityTime } from '../shared/documentActivity.service'
import type { DriverRouteOccurrenceDetail } from '../shared/driverRouteOccurrence.types'
import type { DriverTripStop } from '../shared/driverTrip.types'
import type { OccurrenceDetailState } from '../shared/occurrenceDetailState.service'
import { listRouteOccurrenceDocuments } from '../shared/routeOccurrenceDocuments.service'
import { listSiblingRouteOccurrences } from '../shared/routeOccurrenceView.service'
import type { RouteOccurrenceEntry } from '../shared/routeOccurrenceView.types'
import styles from '../styles/routeOccurrence.module.css'

type DriverOccurrenceDetailPageProps = Readonly<{
  isUnreachable: boolean
  state: OccurrenceDetailState
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

type DetailSectionProps = Readonly<{
  detail: DriverRouteOccurrenceDetail | undefined
  entry: RouteOccurrenceEntry
  isUnreachable: boolean
  shareController: OccurrenceShareController
  stop: DriverTripStop | undefined
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

function handleBack(): void {
  window.history.back()
}

function buildTimelineLines(input: {
  readonly detail: DriverRouteOccurrenceDetail | undefined
  readonly entry: RouteOccurrenceEntry
  readonly t: TFunction<'driverTrip'>
}): readonly { readonly key: string; readonly text: string; readonly time: string }[] {
  const { detail, entry, t } = input
  if (detail !== undefined) {
    return detail.timeline.map((event) => ({
      key: `${event.kind}-${event.at}`,
      text: t(`routeOccurrence.detail.timeline.${event.kind}`),
      time: formatActivityTime(event.at),
    }))
  }
  const recorded = {
    key: 'recorded',
    text: t('routeOccurrence.detail.timeline.recorded'),
    time: formatActivityTime(entry.recordedAt),
  }
  if (entry.state === 'queued') {
    return [
      recorded,
      { key: 'waiting', text: t('routeOccurrence.detail.timeline.waiting'), time: '—' },
    ]
  }
  if (entry.state === 'rejected') {
    return [
      recorded,
      { key: 'rejected', text: t('routeOccurrence.detail.timeline.rejected'), time: '—' },
    ]
  }
  return [recorded]
}

function ResolutionPanel({ detail, entry }: Pick<DetailSectionProps, 'detail' | 'entry'>) {
  const { t } = useTranslation('driverTrip')
  if (entry.state !== 'resolved' && entry.state !== 'cancelled') return null
  const text =
    entry.resolutionNote ??
    (entry.resolutionPhraseKey === undefined
      ? undefined
      : t(`routeOccurrence.phrase.${entry.resolutionPhraseKey}`))
  const resolvedAt = detail?.resolution?.at
  let title = t('routeOccurrence.detail.resolved.cancelled')
  if (entry.state === 'resolved') {
    title =
      resolvedAt === undefined
        ? t('routeOccurrence.detail.resolved.titleNoTime')
        : t('routeOccurrence.detail.resolved.title', { time: formatActivityTime(resolvedAt) })
  }
  return (
    <section className={styles.panel} data-panel="resolution">
      <h2 className={styles.panelTitle}>
        <Icon name="check" size="sm" /> {title}
      </h2>
      {text === undefined ? null : <p className={styles.quote}>{text}</p>}
    </section>
  )
}

function RefusalPanel({ entry }: Pick<DetailSectionProps, 'entry'>) {
  const { t } = useTranslation('driverTrip')
  if (entry.state !== 'rejected') return null
  return (
    <section className={`${styles.panel} ${styles.panelAlert}`} data-panel="refusal">
      <h2 className={styles.panelTitle}>
        <Icon name="close" size="sm" /> {t('routeOccurrence.detail.refused.title')}
      </h2>
      <p className={styles.quote}>
        {entry.rejectionCause ?? t('routeOccurrence.detail.refused.noCause')}
      </p>
      {entry.stopId === '' ? null : (
        <>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => navigateToDriverStop(entry.stopId)}
          >
            {t('routeOccurrence.detail.refused.fix')}
          </button>
          <p className={styles.panelHint}>{t('routeOccurrence.detail.refused.fixHint')}</p>
        </>
      )}
    </section>
  )
}

function ChatButton({ entry }: Pick<DetailSectionProps, 'entry'>) {
  const { t } = useTranslation('driverTrip')
  if (entry.source !== 'server' || !entry.hasConversation) return null
  const isClosed = entry.state === 'resolved' || entry.state === 'cancelled'
  const base = isClosed ? 'routeOccurrence.detail.chat.view' : 'routeOccurrence.detail.chat.open'
  const label = entry.unreadCount > 0 ? t(`${base}Unread`, { count: entry.unreadCount }) : t(base)
  return (
    <button
      className={isClosed ? styles.ghostButton : styles.primaryButton}
      type="button"
      onClick={() =>
        navigateToDriverConversation({ subjectId: entry.id, subjectType: 'occurrence' })
      }
    >
      <Icon name="message" /> {label}
    </button>
  )
}

function RegisteredPanel({
  detail,
  entry,
  stop,
}: Pick<DetailSectionProps, 'detail' | 'entry' | 'stop'>) {
  const { t } = useTranslation('driverTrip')
  const sequence = entry.stopSequence ?? stop?.sequence
  return (
    <section className={styles.panel} data-panel="registered">
      <h2 className={styles.panelTitle}>{t('routeOccurrence.detail.registered.title')}</h2>
      <dl className={styles.facts}>
        {entry.documentNumber === null ? null : (
          <>
            <dt>{t('routeOccurrence.detail.registered.note')}</dt>
            <dd>{entry.documentNumber}</dd>
          </>
        )}
        <dt>{t('routeOccurrence.detail.registered.stop')}</dt>
        <dd>
          {[sequence, stop?.label].filter((part) => part !== undefined && part !== '').join(' · ')}
        </dd>
      </dl>
      {detail === undefined ? null : (
        <>
          <p className={styles.quote}>
            {detail.note ?? t('routeOccurrence.detail.registered.noObservation')}
          </p>
          {detail.photos.length === 0 ? null : (
            <p className={styles.panelHint}>
              {t('routeOccurrence.detail.registered.photos', { count: detail.photos.length })}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function SiblingsPanels({
  entry,
  shareController,
  stops,
  view,
}: Pick<DetailSectionProps, 'entry' | 'shareController' | 'stops' | 'view'>) {
  const { t } = useTranslation('driverTrip')
  const siblings = listSiblingRouteOccurrences({ current: entry, entries: view.entries })
  const renderRows = (entries: readonly RouteOccurrenceEntry[]) =>
    entries.map((sibling) => (
      <DriverOccurrenceRow
        entry={sibling}
        key={sibling.id}
        shareController={shareController}
        stops={stops}
      />
    ))
  return (
    <>
      {siblings.sameNote.length === 0 ? null : (
        <section className={styles.panel} data-panel="same-note">
          <h2 className={styles.panelTitle}>
            {t('routeOccurrence.detail.siblings.sameNote', { number: entry.documentNumber ?? '' })}
          </h2>
          {renderRows(siblings.sameNote)}
        </section>
      )}
      {siblings.sameStop.length === 0 ? null : (
        <section className={styles.panel} data-panel="same-stop">
          <h2 className={styles.panelTitle}>{t('routeOccurrence.detail.siblings.sameStop')}</h2>
          {renderRows(siblings.sameStop)}
        </section>
      )}
    </>
  )
}

function ReadyDetail(props: DetailSectionProps) {
  const { t } = useTranslation('driverTrip')
  const { detail, entry, isUnreachable, shareController, stop } = props
  const typeName = entry.typeName ?? t('routeOccurrence.badge.unknownType')
  const documents = detail === undefined ? [] : listRouteOccurrenceDocuments(detail)
  const hasDocumentsToExplain = documents.length === 0 && isUnreachable && entry.hasDocument
  const timeline = buildTimelineLines({ detail, entry, t })
  const sequence = entry.stopSequence ?? stop?.sequence ?? ''
  const seeStopKey =
    entry.documentNumber === null
      ? 'routeOccurrence.detail.seeStopOnly'
      : 'routeOccurrence.detail.seeStop'

  return (
    <>
      <div className={styles.detailHead}>
        <DriverOccurrenceBadgeIcon entry={entry} isInteractive={false} />
        <div>
          <h2 className={styles.detailTitle}>{typeName}</h2>
          <p className={styles.stateLine} data-state={entry.state}>
            {t('routeOccurrence.detail.stateLine', {
              state: t(`routeOccurrence.state.${entry.state}`),
              time: formatActivityTime(entry.recordedAt),
            })}
          </p>
        </div>
      </div>
      <ResolutionPanel detail={detail} entry={entry} />
      <RefusalPanel entry={entry} />
      <ChatButton entry={entry} />
      {documents.length > 0 || hasDocumentsToExplain ? (
        <DriverOccurrenceDocumentsPanel
          documents={documents}
          isDisabled={isUnreachable}
          occurrence={{ id: entry.id, kind: entry.kind, title: typeName }}
          shareController={shareController}
        />
      ) : null}
      {shareController.notice === undefined ? null : (
        <p className={styles.notice} role="status">
          {t(`routeOccurrence.share.${shareController.notice}`)}
        </p>
      )}
      <RegisteredPanel detail={detail} entry={entry} stop={stop} />
      <section className={styles.panel} data-panel="timeline">
        <h2 className={styles.panelTitle}>{t('routeOccurrence.detail.timeline.title')}</h2>
        <ol className={styles.timeline}>
          {timeline.map((line) => (
            <li key={line.key}>
              <time>{line.time}</time>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      </section>
      <SiblingsPanels
        entry={entry}
        shareController={shareController}
        stops={props.stops}
        view={props.view}
      />
      {entry.stopId === '' ? null : (
        <button
          className={styles.ghostButton}
          data-action="see-stop"
          type="button"
          onClick={() => navigateToDriverStop(entry.stopId)}
        >
          <Icon name="document" /> {t(seeStopKey, { sequence })}
        </button>
      )}
    </>
  )
}

/** Spec 266 RF5: o detalhe de uma ocorrência — estado, resolução ou recusa, chat, documentos e andamento. */
export function DriverOccurrenceDetailPage({
  isUnreachable,
  state,
  stops,
  view,
}: DriverOccurrenceDetailPageProps) {
  const { t } = useTranslation('driverTrip')
  const shareController = useOccurrenceShare()
  const readyEntry = state.status === 'ready' ? state.entry : undefined
  const stop = stops.find((candidate) => candidate.id === readyEntry?.stopId)
  const sequence = readyEntry?.stopSequence ?? stop?.sequence

  const title = readyEntry?.typeName ?? t('routeOccurrence.badge.unknownType')
  let subtitle: string | undefined
  if (readyEntry !== undefined && sequence !== undefined) {
    subtitle =
      readyEntry.documentNumber === null
        ? t('routeOccurrence.detail.subtitleStop', { sequence })
        : t('routeOccurrence.detail.subtitleNote', { number: readyEntry.documentNumber, sequence })
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          aria-label={t('routeOccurrence.detail.back')}
          className={styles.headerBack}
          title={t('routeOccurrence.detail.back')}
          type="button"
          onClick={handleBack}
        >
          <Icon name="arrow-left" />
        </button>
        <h1 className={styles.headerTitle}>
          {state.status === 'ready' ? title : t('routeOccurrence.list.title')}
          {subtitle === undefined ? null : (
            <span className={styles.headerSubtitle}>{subtitle}</span>
          )}
        </h1>
      </header>
      {state.status === 'loading' ? (
        <p className={styles.notice} role="status">
          {t('routeOccurrence.detail.loading')}
        </p>
      ) : null}
      {state.status === 'offlineEmpty' ? (
        <p className={styles.notice} role="status">
          {t('routeOccurrence.list.offlineEmpty')}
        </p>
      ) : null}
      {state.status === 'notFound' ? (
        <section className={styles.notice} role="status">
          <strong>{t('routeOccurrence.detail.notFound')}</strong>
          <p>{t('routeOccurrence.detail.notFoundHint')}</p>
        </section>
      ) : null}
      {state.status === 'tripFinished' ? (
        <section className={styles.notice} role="status">
          <strong>{t('routeOccurrence.detail.tripFinished')}</strong>
          <p>{t('routeOccurrence.detail.tripFinishedHint')}</p>
        </section>
      ) : null}
      {state.status === 'ready' ? (
        <ReadyDetail
          detail={state.detail}
          entry={state.entry}
          isUnreachable={isUnreachable}
          shareController={shareController}
          stop={stop}
          stops={stops}
          view={view}
        />
      ) : null}
    </main>
  )
}
