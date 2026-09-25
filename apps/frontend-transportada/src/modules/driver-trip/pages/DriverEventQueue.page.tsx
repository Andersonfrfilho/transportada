/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
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
  /** Ausente na tela de pendências do painel (ADR-0075 §6): ali não há viagem para onde voltar. */
  onBack?: () => void
  /** ADR-0075 §6, "descartar com ciência": só a tela de pendências do painel oferece o descarte. */
  onDiscard?: (idempotencyKey: string) => void
  onSendAll: () => void
  onSendOne: (idempotencyKey: string) => void
}>

const KIND_LABEL_KEYS: Readonly<Record<EventQueueItemView['kind'], string>> = {
  arrive: 'eventQueue.kind.arrive',
  deliver: 'eventQueue.kind.deliver',
  occurrence: 'eventQueue.kind.occurrence',
  /** Grupo de anexos cujo evento já subiu — só os arquivos aguardam. */
  proof: 'eventQueue.kind.proof',
  return: 'eventQueue.kind.return',
}

/** Recusado pelo servidor — o evento ou um anexo dele. É o único item que se pode descartar. */
function isDiscardable(item: EventQueueItemView): boolean {
  return item.status.state === 'rejected' || item.attachmentRejectionCause !== undefined
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
  onDiscard,
  onSendAll,
  onSendOne,
}: DriverEventQueuePageProps) {
  const { t } = useTranslation('driverTrip')
  /** O descarte não se desfaz: o primeiro toque só abre o aviso, e o segundo é que apaga. */
  const [confirmingDiscardKey, setConfirmingDiscardKey] = useState<string | undefined>(undefined)

  function statusLabel(item: EventQueueItemView): string {
    if (item.status.state === 'rejected') {
      return t('eventQueue.status.rejected', { cause: item.status.cause })
    }
    if (item.status.state === 'failed') {
      return t('eventQueue.status.failed', { count: item.status.attempts })
    }
    return t('eventQueue.status.queued')
  }

  function sendNowButton(item: EventQueueItemView) {
    return (
      <Button
        disabled={isSyncing}
        type="button"
        variant="secondary"
        onClick={() => onSendOne(item.idempotencyKey)}
      >
        {t('eventQueue.sendNow')}
      </Button>
    )
  }

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        {onBack === undefined ? null : (
          <Button type="button" variant="secondary" onClick={onBack}>
            {t('eventQueue.back')}
          </Button>
        )}
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
                  {/* Problema do ANEXO, não do evento: o evento aceito permanece aceito. */}
                  {item.attachmentRejectionCause === undefined ? null : (
                    <p className={styles.eventQueueStatusRejected}>
                      {t('eventQueue.status.attachmentRejected', {
                        cause: item.attachmentRejectionCause,
                      })}
                    </p>
                  )}
                  <p
                    className={
                      item.status.state === 'rejected'
                        ? styles.eventQueueStatusRejected
                        : styles.profileMeta
                    }
                  >
                    {statusLabel(item)}
                  </p>
                  {onDiscard !== undefined && confirmingDiscardKey === item.idempotencyKey ? (
                    <div className={styles.eventQueueDiscardConfirm}>
                      <p className={styles.eventQueueStatusRejected} role="alert">
                        {t('eventQueue.discard.warning')}
                      </p>
                      <div className={styles.eventQueueItemActions}>
                        <Button
                          disabled={isSyncing}
                          type="button"
                          onClick={() => {
                            setConfirmingDiscardKey(undefined)
                            onDiscard(item.idempotencyKey)
                          }}
                        >
                          <Icon name="trash" />
                          {t('eventQueue.discard.confirm')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setConfirmingDiscardKey(undefined)}
                        >
                          {t('eventQueue.discard.keep')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* Sem descarte (a viagem de sempre), a marcação continua a de antes: só o envio. */}
                {onDiscard === undefined ? (
                  sendNowButton(item)
                ) : (
                  <div className={styles.eventQueueItemActions}>
                    {sendNowButton(item)}
                    {isDiscardable(item) ? (
                      <Button
                        disabled={isSyncing}
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmingDiscardKey(item.idempotencyKey)}
                      >
                        {t('eventQueue.discard.open')}
                      </Button>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
