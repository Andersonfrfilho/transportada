/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NotificationItem,
  NotificationList,
  flattenNotificationPages,
  useNotifications,
} from '@adatechnology/notification-ui'
import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { isNotificationVisible } from '../shared/notificationVisibility.service'
import type { NotificationTargetSource } from '../shared/notificationTarget.service'

type NotificationInboxListProps = Readonly<{
  onSelect: (notification: NotificationTargetSource) => void
}>

/** A linha do pacote, escondida quando já foi lida em outro dia. */
const VisibleNotificationItem: typeof NotificationItem = (props) =>
  isNotificationVisible(props.notification) ? <NotificationItem {...props} /> : (null as never)

/**
 * A lista de notificações do painel: lidas só aparecem no dia em que foram lidas. O filtro é na
 * linha, e o vazio é refeito aqui — quando só sobram lidas antigas, o pacote ainda vê itens e não
 * desenharia o "nada por aqui". A mesma consulta alimenta o pacote (mesma chave de cache).
 */
export function NotificationInboxList({ onSelect }: NotificationInboxListProps): JSX.Element {
  const { t } = useTranslation('notification')
  const query = useNotifications()
  const notifications = flattenNotificationPages(query.data?.pages)
  const hiddenOnly =
    !query.isPending &&
    !query.isError &&
    notifications.length > 0 &&
    !notifications.some((notification) => isNotificationVisible(notification))
  const renderEmpty = (): ReactNode => <p>{t('empty')}</p>

  return (
    <>
      <NotificationList
        components={{ Item: VisibleNotificationItem }}
        onSelect={onSelect}
        renderEmpty={renderEmpty}
      />
      {hiddenOnly && !query.hasNextPage ? renderEmpty() : null}
    </>
  )
}
