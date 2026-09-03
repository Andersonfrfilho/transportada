/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { hasSendableEvents, type EventQueueItemView } from '../shared/eventQueueView.service'
import styles from '../styles/driverTrip.module.css'

type DriverEventQueuePageProps = Readonly<{
  isLoading: boolean
  isSyncing: boolean
  items: readonly EventQueueItemView[]
  onBack: () => void
  onSendAll: () => void
  onSendOne: (idempotencyKey: string) => void
}>

const KIND_LABEL_KEYS: Readonly<Record<EventQueueItemView['kind'], string>> = {
  arrive: 'eventQueue.kind.arrive',
  deliver: 'eventQueue.kind.deliver',
  occurrence: 'eventQueue.kind.occurrence',
  return: 'eventQueue.kind.return',
}

/**
 * Spec 082 D7: a fila inteira à vista — tipo, hora, anexos e o estado como ele está gravado. O
 * envio manual entra pela mesma drenagem do automático; durante um envio os botões desabilitam,
 * nunca somem.
 */
export function DriverEventQueuePage({
  isLoading,
  isSyncing,
  items,
  onBack,
  onSendAll,
  onSendOne,
}: DriverEventQueuePageProps) {
  const { t } = useTranslation('driverTrip')

  function statusLabel(item: EventQueueItemView): string {
    if (item.status.state === 'rejected') {
      return t('eventQueue.status.rejected', { cause: item.status.cause })
    }
    if (item.status.state === 'failed') {
      return t('eventQueue.status.failed', { count: item.status.attempts })
    }
    return t('eventQueue.status.queued')
  }

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('eventQueue.back')}
        </Button>
        <h1 className={styles.eventQueueTitle}>{t('eventQueue.title')}</h1>
      </header>

      {isLoading ? (
        <SkeletonGroup label={t('loading')}>
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </SkeletonGroup>
      ) : items.length === 0 ? (
        <p className={styles.profileMeta} role="status">
          {t('eventQueue.empty')}
        </p>
      ) : (
        <>
          <Button
            className={styles.eventQueueSendAll}
            disabled={isSyncing || !hasSendableEvents(items)}
            type="button"
            onClick={onSendAll}
          >
            <Icon name="upload" />
            {t('eventQueue.sendAll')}
          </Button>
          <ul className={styles.eventQueueList}>
            {items.map((item) => (
              <li className={styles.eventQueueItem} key={item.idempotencyKey}>
                <div className={styles.eventQueueItemBody}>
                  <p className={styles.eventQueueItemTitle}>
                    {t(KIND_LABEL_KEYS[item.kind])}
                    <span className={styles.eventQueueItemTime}>
                      {new Date(item.queuedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </p>
                  {item.attachmentCount > 0 ? (
                    <p className={styles.profileMeta}>
                      {t('eventQueue.attachments', { count: item.attachmentCount })}
                    </p>
                  ) : null}
                  <p
                    className={
                      item.status.state === 'rejected'
                        ? styles.eventQueueStatusRejected
                        : styles.profileMeta
                    }
                  >
                    {statusLabel(item)}
                  </p>
                </div>
                <Button
                  disabled={isSyncing}
                  type="button"
                  variant="secondary"
                  onClick={() => onSendOne(item.idempotencyKey)}
                >
                  {t('eventQueue.sendNow')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
