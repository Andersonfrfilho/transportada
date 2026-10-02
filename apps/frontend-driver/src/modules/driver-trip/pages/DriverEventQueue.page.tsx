/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/pages/DriverEventQueue.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverSyncStatus } from '../components/DriverSyncStatus.component'
import type { DriverTripStop } from '../shared/driverTrip.types'
import {
  hasSendableEvents,
  resolveEventQueueDepartBlock,
  resolveEventQueueStopSequence,
  type EventQueueItemView,
} from '../shared/eventQueueView.service'
import { resolveRejectionCauseLabelKey } from '../shared/rejectionCauseLabel.service'
import styles from '../styles/driverTrip.module.css'

type DriverEventQueuePageProps = Readonly<{
  /** Spec 206 D9: a parada a caminho AGORA — é ela que o motivo/atalho de bloqueio apontam (RF8b). */
  enRouteStopId?: string
  isLoading: boolean
  isSyncing: boolean
  items: readonly EventQueueItemView[]
  /** Pedido do usuário (01/10): de quando é a última leitura do servidor — `0` é "nunca nesta sessão". */
  lastSyncedAtMs: number
  onBack: () => void
  /** Spec 206 D6: o mesmo atalho do cartão — rola até o cabeçalho da parada e põe o foco (RF8b). */
  onFocusStop: (stopId: string) => void
  onSendAll: () => void
  onSendOne: (idempotencyKey: string) => void
  /** Spec 206 RF8: dá o número da parada do item ("Iniciar rota — parada N"). */
  stops: readonly DriverTripStop[]
}>

const KIND_LABEL_KEYS: Readonly<Record<EventQueueItemView['kind'], string>> = {
  arrive: 'eventQueue.kind.arrive',
  /** Spec 206 D1: "Iniciar rota" — o rótulo carrega a sequência da parada, à parte (RF8). */
  depart: 'eventQueue.kind.depart',
  /** Spec 206 D18: desfaz o "Iniciar rota" — mesmo molde do `depart` acima. */
  cancelDeparture: 'eventQueue.kind.cancelDeparture',
  deliver: 'eventQueue.kind.deliver',
  /** Spec 179: a ocorrência da nota com a foto — os dois sobem juntos, no mesmo item. */
  documentOccurrence: 'eventQueue.kind.documentOccurrence',
  occurrence: 'eventQueue.kind.occurrence',
  /** Spec 209: a foto do "Deu problema", atrás da ocorrência — pendente sem segurar o relato. */
  stopOccurrencePhoto: 'eventQueue.kind.stopOccurrencePhoto',
  /** Grupo de anexos cujo evento já subiu — só os arquivos aguardam. */
  proof: 'eventQueue.kind.proof',
  /** Spec 193 D7: quem recebeu chegado depois do anexo — o PATCH `.../proof/receiver`. */
  proofReceiver: 'eventQueue.kind.proofReceiver',
  return: 'eventQueue.kind.return',
}

/**
 * Spec 082 D7: a fila inteira à vista — tipo, hora, anexos e o estado como ele está gravado. O
 * envio manual entra pela mesma drenagem do automático; durante um envio os botões desabilitam,
 * nunca somem.
 */
export function DriverEventQueuePage({
  enRouteStopId,
  isLoading,
  isSyncing,
  items,
  lastSyncedAtMs,
  onBack,
  onFocusStop,
  onSendAll,
  onSendOne,
  stops,
}: DriverEventQueuePageProps) {
  const { t } = useTranslation('driverTrip')
  /** O que a drenagem ainda pode levar: recusado não conta, porque só sai de lá por decisão humana. */
  const pendingCount = items.filter((item) => item.status.state !== 'rejected').length

  /** Spec 212: a causa conhecida sai em texto humano; a desconhecida, crua como veio. */
  function causeLabel(cause: string): string {
    const key = resolveRejectionCauseLabelKey(cause)
    return key === undefined ? cause : t(key)
  }

  /** Spec 206 RF8: "Iniciar rota — parada N", sem número quando a parada saiu do snapshot. */
  function itemTitle(item: EventQueueItemView): string {
    if (item.kind === 'depart') {
      const sequence = resolveEventQueueStopSequence({ item, stops })
      if (sequence !== undefined) return t('eventQueue.itemTitle.depart', { sequence })
    }
    return t(KIND_LABEL_KEYS[item.kind])
  }

  function statusLabel(item: EventQueueItemView): string {
    if (item.status.state === 'rejected') {
      return t('eventQueue.status.rejected', { cause: causeLabel(item.status.cause) })
    }
    if (item.status.state === 'unverified') return t('eventQueue.status.unverified')
    if (item.status.state === 'failed') {
      return t('eventQueue.status.failed', { count: item.status.attempts })
    }
    return t('eventQueue.status.queued')
  }

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        <Button type="button" variant="secondary" onClick={onBack}>
          <Icon name="close" />
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
          {/*
           * Pedido do usuário (01/10): o envio em massa é o botão de emergência, e precisa MOSTRAR
           * que está acontecendo — antes ele só ficava desabilitado, indistinguível de travado.
           */}
          <DriverSyncStatus
            isSyncing={isSyncing}
            lastSyncedAtMs={lastSyncedAtMs}
            pendingCount={pendingCount}
          />
          <Button
            aria-busy={isSyncing}
            aria-disabled={isSyncing || !hasSendableEvents(items)}
            className={styles.eventQueueSendAll}
            /**
             * `disabled` só para "não há o que enviar". Durante o envio vale `aria-disabled`: o
             * `.ui-button:disabled` tem `opacity: 0.5` e apagava justamente o texto que diz o que
             * está acontecendo (medido no print da revisão). O toque é recusado no handler.
             */
            disabled={!hasSendableEvents(items)}
            type="button"
            onClick={() => {
              if (isSyncing) return
              onSendAll()
            }}
          >
            {isSyncing ? (
              <span aria-hidden="true" className={styles.syncStatusSpinner} />
            ) : (
              <Icon name="upload" />
            )}
            {t(isSyncing ? 'eventQueue.sending' : 'eventQueue.sendAll')}
          </Button>
          <ul className={styles.eventQueueList}>
            {items.map((item) => {
              const departBlock = resolveEventQueueDepartBlock({ enRouteStopId, item, stops })
              return (
                <li
                  className={styles.eventQueueItem}
                  /* Pulsa só o que está realmente subindo: o recusado espera decisão, não a rede. */
                  data-syncing={isSyncing && item.status.state !== 'rejected' ? 'true' : undefined}
                  key={item.idempotencyKey}
                >
                  <div className={styles.eventQueueItemBody}>
                    <p className={styles.eventQueueItemTitle}>
                      {itemTitle(item)}
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
                          cause: causeLabel(item.attachmentRejectionCause),
                        })}
                      </p>
                    )}
                    {/*
                     * Spec 206 RF8b: o `depart` recusado por outra parada a caminho não pode sumir
                     * calado — o motivo e o atalho substituem o texto genérico de recusa.
                     */}
                    {departBlock === undefined ? (
                      <p
                        className={
                          item.status.state === 'rejected'
                            ? styles.eventQueueStatusRejected
                            : styles.profileMeta
                        }
                      >
                        {statusLabel(item)}
                      </p>
                    ) : (
                      <p className={styles.departBlocked} role="status">
                        <span>
                          {t('departBlocked.queueReason', {
                            sequence: departBlock.blockingStopSequence,
                          })}
                        </span>
                        <button
                          className={styles.departBlockedShortcut}
                          onClick={() => onFocusStop(departBlock.blockingStopId)}
                          type="button"
                        >
                          <Icon aria-hidden="true" name="link" size="sm" />
                          {t('departBlocked.shortcut', {
                            sequence: departBlock.blockingStopSequence,
                          })}
                        </button>
                      </p>
                    )}
                  </div>
                  {/* Não verificado sobe pela confirmação da faixa da viagem, não item a item. */}
                  {item.status.state === 'unverified' ? null : (
                    <Button
                      disabled={isSyncing}
                      type="button"
                      variant="secondary"
                      onClick={() => onSendOne(item.idempotencyKey)}
                    >
                      <Icon name="upload" />
                      {t('eventQueue.sendNow')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
