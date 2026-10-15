/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'
import { navigateToDriverOccurrence } from '@/modules/shared/driverRoute.service'

import { formatActivityTime } from '../shared/documentActivity.service'
import { isOccurrenceTypeIconName } from '../shared/occurrenceTypeIcon.constant'
import type {
  RouteOccurrenceEntry,
  RouteOccurrenceEntryState,
} from '../shared/routeOccurrenceView.types'
import styles from '../styles/driverTrip.module.css'

/** Enviada (aberta no servidor) é o avião; fila é o relógio; recusada e cancelada são o X; resolvida é o visto. */
const STATE_ICON: Readonly<Record<RouteOccurrenceEntryState, IconName>> = {
  cancelled: 'close',
  open: 'send',
  queued: 'clock',
  rejected: 'close',
  resolved: 'check',
}

type DriverOccurrenceBadgeIconProps = Readonly<{
  entry: RouteOccurrenceEntry
  /** `false` desenha só a figura (dentro de uma linha que já é um botão); o padrão abre o detalhe. */
  isInteractive?: boolean
}>

/** Spec 266 RF3: o ícone do tipo com os selos de estado, mensagens novas e documento; o toque abre o detalhe. */
export function DriverOccurrenceBadgeIcon({
  entry,
  isInteractive = true,
}: DriverOccurrenceBadgeIconProps) {
  const { t } = useTranslation('driverTrip')
  const typeIcon: IconName = isOccurrenceTypeIconName(entry.iconName) ? entry.iconName : 'alert'
  const parts = [
    entry.typeName ?? t('routeOccurrence.badge.unknownType'),
    t(`routeOccurrence.state.${entry.state}`),
    t('routeOccurrence.badge.at', { time: formatActivityTime(entry.recordedAt) }),
    ...(entry.unreadCount > 0
      ? [t('routeOccurrence.badge.unread', { count: entry.unreadCount })]
      : []),
    ...(entry.hasDocument ? [t('routeOccurrence.badge.hasDocument')] : []),
  ]
  const label = parts.join(' · ')

  const badges = (
    <>
      <Icon name={typeIcon} />
      <span aria-hidden="true" className={styles.occurrenceStateBadge}>
        <Icon name={STATE_ICON[entry.state]} size="sm" />
      </span>
      {entry.unreadCount > 0 ? (
        <span aria-hidden="true" className={styles.occurrenceUnreadDot}>
          {entry.unreadCount}
        </span>
      ) : null}
      {entry.hasDocument ? (
        <span aria-hidden="true" className={styles.occurrenceClipBadge} data-badge="documents">
          <Icon name="paperclip" size="sm" />
        </span>
      ) : null}
    </>
  )

  if (!isInteractive) {
    return (
      <span
        aria-label={label}
        className={styles.occurrenceIcon}
        data-occurrence-icon=""
        data-state={entry.state}
        role="img"
        title={label}
      >
        {badges}
      </span>
    )
  }

  return (
    <button
      aria-label={label}
      className={styles.occurrenceIcon}
      data-occurrence-icon=""
      data-state={entry.state}
      title={label}
      type="button"
      onClick={() => navigateToDriverOccurrence({ id: entry.id, kind: entry.kind })}
    >
      {badges}
    </button>
  )
}
