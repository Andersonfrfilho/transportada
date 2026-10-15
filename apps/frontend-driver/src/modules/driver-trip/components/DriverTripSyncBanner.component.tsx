/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { EventQueueItemView } from '../shared/eventQueueView.service'
import { countSyncingEvents, resolveTripSyncBanner } from '../shared/tripSyncBanner.service'
import styles from '../styles/driverTrip.module.css'

/** Quanto "Sincronizado" fica na tela depois que a fila esvazia — o suficiente para o motorista ver. */
export const TRIP_SYNCED_VISIBLE_MS = 8000

/**
 * Pedido do usuário (15/10): no topo da viagem, "Sincronizando eventos" enquanto a fila tem evento e
 * "Sincronizado" quando ela esvazia. Recusa do escritório aparece à parte e nunca diz "Sincronizado".
 */
export function DriverTripSyncBanner({
  onOpen,
  onSendNow,
  queueView,
}: Readonly<{
  onOpen: () => void
  onSendNow?: () => void
  queueView: readonly EventQueueItemView[]
}>) {
  const { t } = useTranslation('driverTrip')
  const [justSynced, setJustSynced] = useState(false)
  const wasSyncing = useRef(false)
  const syncingCount = countSyncingEvents(queueView)

  useEffect(() => {
    if (syncingCount > 0) {
      wasSyncing.current = true
      setJustSynced(false)
      return
    }
    if (!wasSyncing.current) return
    wasSyncing.current = false
    setJustSynced(true)
    const timer = window.setTimeout(() => setJustSynced(false), TRIP_SYNCED_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [syncingCount])

  const state = resolveTripSyncBanner({ justSynced, queueView })
  /** Teste local (15/10): a falha aparece no topo mesmo com o cartão da parada recolhido. */
  const hasFailure = queueView.some((item) => item.status.state === 'failed')
  if (state.kind === 'idle') return null

  return (
    <div aria-live="polite" className={styles.tripSyncBanner} data-state={state.kind} role="status">
      {state.kind === 'syncing' || (state.kind === 'rejected' && state.syncing > 0) ? (
        <span>
          <span aria-hidden="true" className={styles.syncStatusSpinner} />
          {t('tripSync.syncing', { count: state.syncing })}
        </span>
      ) : null}
      {state.kind === 'rejected' ? (
        <span>
          <Icon aria-hidden="true" name="clock" size="sm" />
          {t('tripSync.rejected', { count: state.rejected })}
        </span>
      ) : null}
      {hasFailure ? (
        <span role="alert">
          <Icon aria-hidden="true" name="clock" size="sm" />
          {t('tripSync.failed')}
          {onSendNow === undefined ? null : (
            <button className={styles.tripSyncOpen} onClick={onSendNow} type="button">
              {t('deliveryGate.sendNow')}
            </button>
          )}
        </span>
      ) : null}
      {state.kind === 'synced' ? (
        <span>
          <Icon aria-hidden="true" name="check" size="sm" />
          {t('tripSync.synced')}
        </span>
      ) : null}
      <button className={styles.tripSyncOpen} onClick={onOpen} type="button">
        {t('tripSync.open')}
      </button>
    </div>
  )
}
