/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  resolveQueuedDeliverState,
  type EventQueueItemView,
} from '../shared/eventQueueView.service'
import styles from '../styles/driverTrip.module.css'

/** Envio normal sai em segundos: "Enviar agora" só aparece depois disto, ou depois de uma falha. */
export const SEND_NOW_DELAY_MS = 8000

/**
 * Teste local do #250 (15/10): "Enviar agora" nos primeiros segundos de um envio normal parecia ação de
 * erro, e o aviso de sinal fraco sumia ao tocar nele com a rede ainda falhando. Aqui o aviso, uma vez
 * visto, fica até a entrega sair da fila; o botão só aparece após uma falha ou alguns segundos de espera.
 */
export function DriverDeliverSyncNotice({
  documentId,
  onSendNow,
  queueView,
}: Readonly<{
  documentId: string
  onSendNow: (() => void) | undefined
  queueView: readonly EventQueueItemView[]
}>) {
  const { t } = useTranslation('driverTrip')
  const state = resolveQueuedDeliverState(queueView, documentId)
  const [hasFailed, setHasFailed] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  if (state === 'retrying' && !hasFailed) setHasFailed(true)
  if (state === 'none' && hasFailed) setHasFailed(false)

  const queuedAtMs = Math.min(
    ...queueView
      .filter(
        (item) =>
          item.kind === 'deliver' &&
          item.documentId === documentId &&
          item.status.state !== 'rejected',
      )
      .map((item) => Date.parse(item.queuedAt)),
  )
  const waitMs = Number.isFinite(queuedAtMs) ? queuedAtMs + SEND_NOW_DELAY_MS - nowMs : 0

  useEffect(() => {
    if (state === 'none' || hasFailed || waitMs <= 0) return
    const timer = window.setTimeout(() => setNowMs(Date.now()), waitMs + 50)
    return () => window.clearTimeout(timer)
  }, [hasFailed, state, waitMs])

  if (state === 'none') return null
  const showSendNow = (hasFailed || waitMs <= 0) && onSendNow !== undefined

  return (
    <>
      {hasFailed ? (
        <p className={styles.stopMeta} role="status">
          {t('deliveryGate.retrying')}
        </p>
      ) : null}
      {showSendNow ? (
        <div className={styles.actions}>
          <Button onClick={onSendNow} type="button" variant="ghost">
            {t('deliveryGate.sendNow')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
