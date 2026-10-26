/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { ClientEmailSendButton } from '@/modules/client-email/components/ClientEmailSendButton.component'
import {
  navigateToDriverConversation,
  navigateToDriverOccurrence,
} from '@/modules/shared/driverRoute.service'

import type { OccurrenceShareController } from '../hooks/useOccurrenceShare.hook'
import { formatActivityTime } from '../shared/documentActivity.service'
import type { DriverTripStop } from '../shared/driverTrip.types'
import { shareRouteOccurrenceDocumentsById } from '../shared/routeOccurrenceDocuments.service'
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

/** A linha sempre leva ao detalhe (onde ficam os documentos); a conversa e o compartilhar são botões à parte. */
export function DriverOccurrenceRow({ entry, shareController, stops }: DriverOccurrenceRowProps) {
  const { t } = useTranslation('driverTrip')
  const hasChat = entry.source === 'server' && entry.hasConversation
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
    navigateToDriverOccurrence({ id: entry.id, kind: entry.kind })
  }

  function handleOpenChat(): void {
    navigateToDriverConversation({ subjectId: entry.id, subjectType: 'occurrence' })
  }

  return (
    <div
      className={styles.row}
      data-resolved={entry.state === 'resolved' || entry.state === 'cancelled'}
      data-target="detail"
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
        <span className={styles.rowAction} title={t('routeOccurrence.list.row.opensDetail')}>
          <Icon name="document" />
        </span>
      </button>
      {hasChat ? (
        <button
          aria-label={t('routeOccurrence.list.row.opensChat')}
          className={styles.rowChat}
          title={t('routeOccurrence.list.row.opensChat')}
          type="button"
          onClick={handleOpenChat}
        >
          <Icon name="message" />
          {entry.unreadCount > 0 ? (
            <span className={styles.rowUnread}>{entry.unreadCount}</span>
          ) : null}
        </button>
      ) : null}
      {entry.source === 'server' ? (
        <div className={styles.rowFooter}>
          <ClientEmailSendButton
            contextLabel={typeName}
            phraseKey={entry.resolutionPhraseKey}
            occurrenceId={entry.id}
          />
        </div>
      ) : null}
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
