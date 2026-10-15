/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import {
  navigateToDriverConversation,
  navigateToDriverOccurrence,
} from '@/modules/shared/driverRoute.service'

import type { OccurrenceShareController } from '../hooks/useOccurrenceShare.hook'
import { formatActivityTime } from '../shared/documentActivity.service'
import type { DriverTripStop } from '../shared/driverTrip.types'
import { shareRouteOccurrenceDocumentsById } from '../shared/routeOccurrenceDocuments.service'
import { resolveRouteOccurrenceTarget } from '../shared/routeOccurrenceView.service'
import type { RouteOccurrenceEntry } from '../shared/routeOccurrenceView.types'
import styles from '../styles/routeOccurrence.module.css'
import { DriverOccurrenceBadgeIcon } from './DriverOccurrenceBadgeIcon.component'

type DriverOccurrenceRowProps = Readonly<{
  entry: RouteOccurrenceEntry
  shareController: OccurrenceShareController
  stops: readonly DriverTripStop[]
}>

/** "NF · P<parada> · destinatário"; a ocorrência de parada, sem nota, mostra só a parada. */
function buildRowLine(input: {
  readonly entry: RouteOccurrenceEntry
  readonly stops: readonly DriverTripStop[]
  readonly t: TFunction<'driverTrip'>
}): string {
  const { entry, stops, t } = input
  const stop = stops.find((candidate) => candidate.id === entry.stopId)
  const sequence = entry.stopSequence ?? stop?.sequence ?? ''
  const label = stop?.label ?? ''
  if (entry.documentNumber === null) return t('routeOccurrence.list.row.stop', { label, sequence })
  return t('routeOccurrence.list.row.note', { label, number: entry.documentNumber, sequence })
}

/** Spec 266 RF4: a linha leva ao chat quando ele existe, senão ao detalhe; o compartilhar é um botão à parte. */
export function DriverOccurrenceRow({ entry, shareController, stops }: DriverOccurrenceRowProps) {
  const { t } = useTranslation('driverTrip')
  const target = resolveRouteOccurrenceTarget(entry)
  const isChat = target.kind === 'conversation'
  const typeName = entry.typeName ?? t('routeOccurrence.badge.unknownType')
  const hasDocuments = entry.source === 'server' && entry.hasDocument

  function handleShare(): void {
    void shareController.share({
      key: entry.id,
      run: () =>
        shareRouteOccurrenceDocumentsById({ id: entry.id, kind: entry.kind, title: typeName }),
    })
  }

  function handleOpen(): void {
    if (target.kind === 'conversation') {
      navigateToDriverConversation({
        subjectId: target.subjectId,
        subjectType: target.subjectType,
      })
      return
    }
    navigateToDriverOccurrence({ id: target.id, kind: target.occurrenceKind })
  }

  return (
    <div
      className={styles.row}
      data-resolved={entry.state === 'resolved' || entry.state === 'cancelled'}
      data-target={target.kind}
    >
      <button className={styles.rowMain} type="button" onClick={handleOpen}>
        <DriverOccurrenceBadgeIcon entry={entry} isInteractive={false} />
        <span className={styles.rowBody}>
          <strong>{typeName}</strong>
          <span className={styles.rowLine}>{buildRowLine({ entry, stops, t })}</span>
          <span className={styles.rowLine}>
            <Icon name="clock" size="sm" /> {formatActivityTime(entry.recordedAt)}
          </span>
        </span>
        <span
          className={styles.rowAction}
          title={t(
            isChat ? 'routeOccurrence.list.row.opensChat' : 'routeOccurrence.list.row.opensDetail',
          )}
        >
          <Icon name={isChat ? 'message' : 'document'} />
          {isChat && entry.unreadCount > 0 ? (
            <span className={styles.rowUnread}>{entry.unreadCount}</span>
          ) : null}
        </span>
      </button>
      {hasDocuments ? (
        <button
          aria-label={t('routeOccurrence.list.row.share', { type: typeName })}
          className={styles.rowShare}
          disabled={shareController.pendingKey === entry.id}
          title={t('routeOccurrence.list.row.share', { type: typeName })}
          type="button"
          onClick={handleShare}
        >
          <Icon name="share" />
        </button>
      ) : null}
    </div>
  )
}
