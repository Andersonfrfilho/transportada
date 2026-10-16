/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { EventQueueItemView } from '../shared/eventQueueView.service'
import {
  countSyncingEvents,
  resolveTripSyncBanner,
  resolveTripSyncProgress,
  type TripSyncBannerState,
} from '../shared/tripSyncBanner.service'
import styles from '../styles/driverTrip.module.css'

/** Quanto "Sincronizado" fica na tela depois que a fila esvazia — o suficiente para o motorista ver. */
export const TRIP_SYNCED_VISIBLE_MS = 4000

/** Duração da animação de saída (`driver-sync-banner-out`); o aviso só desmonta depois dela. */
export const TRIP_SYNC_LEAVE_MS = 220

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Pedido do usuário (15/10): no topo da viagem, "Sincronizando eventos" enquanto a fila tem evento e
 * "Sincronizado" quando ela esvazia. Recusa do escritório aparece à parte e nunca diz "Sincronizado".
 * Pedido do usuário (16/10): entra e sai animado e leva uma barra de progresso. "Sincronizado" completa a
 * barra e some sozinho; falha e recusa ficam até o motorista agir. Sem movimento para quem pediu menos.
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
  const peakSyncing = useRef(0)
  const syncingCount = countSyncingEvents(queueView)
  if (syncingCount > 0) peakSyncing.current = Math.max(peakSyncing.current, syncingCount)

  useEffect(() => {
    if (syncingCount > 0) {
      wasSyncing.current = true
      setJustSynced(false)
      return
    }
    if (!wasSyncing.current) return
    wasSyncing.current = false
    setJustSynced(true)
    const timer = window.setTimeout(() => {
      peakSyncing.current = 0
      setJustSynced(false)
    }, TRIP_SYNCED_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [syncingCount])

  const current = resolveTripSyncBanner({ justSynced, queueView })
  const isVisible = current.kind !== 'idle'
  /** O último estado visível: a saída anima em cima dele, não do `idle` que já chegou. */
  const lastVisible = useRef<TripSyncBannerState>(current)
  if (isVisible) lastVisible.current = current
  const [isMounted, setIsMounted] = useState(isVisible)

  useEffect(() => {
    if (isVisible) {
      setIsMounted(true)
      return
    }
    if (prefersReducedMotion()) {
      setIsMounted(false)
      return
    }
    const timer = window.setTimeout(() => setIsMounted(false), TRIP_SYNC_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [isVisible])

  if (!isVisible && !isMounted) return null
  const state = isVisible ? current : lastVisible.current
  const isLeaving = !isVisible
  const showsBar =
    state.kind === 'syncing' ||
    state.kind === 'synced' ||
    (state.kind === 'rejected' && state.syncing > 0)
  const progress = resolveTripSyncProgress({
    peak: peakSyncing.current,
    remaining: syncingCount,
    synced: state.kind === 'synced',
  })
  /** Teste local (15/10): a falha aparece no topo mesmo com o cartão da parada recolhido. */
  const hasFailure = queueView.some((item) => item.status.state === 'failed')

  return (
    <div
      aria-live="polite"
      className={styles.tripSyncBanner}
      data-leaving={isLeaving ? 'true' : undefined}
      data-state={state.kind}
      role="status"
    >
      {state.kind === 'syncing' || (state.kind === 'rejected' && state.syncing > 0) ? (
        <span className={styles.tripSyncItem} data-tone="waiting">
          <span aria-hidden="true" className={styles.syncStatusSpinner} />
          {t('tripSync.syncing', { count: state.syncing })}
        </span>
      ) : null}
      {state.kind === 'rejected' ? (
        <span className={styles.tripSyncItem} data-tone="error">
          <Icon aria-hidden="true" name="alert" size="sm" />
          {t('tripSync.rejected', { count: state.rejected })}
        </span>
      ) : null}
      {hasFailure ? (
        <span className={styles.tripSyncItem} data-tone="attention" role="alert">
          <Icon aria-hidden="true" name="alert" size="sm" />
          {t('tripSync.failed')}
          {onSendNow === undefined ? null : (
            <button className={styles.tripSyncAction} onClick={onSendNow} type="button">
              <Icon aria-hidden="true" name="refresh" size="sm" />
              {t('deliveryGate.sendNow')}
            </button>
          )}
        </span>
      ) : null}
      {state.kind === 'synced' ? (
        <span className={styles.tripSyncItem} data-tone="done">
          <Icon aria-hidden="true" name="check" size="sm" />
          {t('tripSync.synced')}
        </span>
      ) : null}
      <button className={styles.tripSyncOpen} onClick={onOpen} type="button">
        <Icon aria-hidden="true" name="clipboard-list" size="sm" />
        {t('tripSync.open')}
      </button>
      {showsBar ? (
        <div
          aria-label={t('tripSync.progress')}
          aria-valuemax={progress.kind === 'determinate' ? 100 : undefined}
          aria-valuemin={progress.kind === 'determinate' ? 0 : undefined}
          aria-valuenow={progress.kind === 'determinate' ? progress.percent : undefined}
          className={styles.tripSyncBar}
          data-mode={progress.kind}
          role="progressbar"
        >
          <span
            className={styles.tripSyncBarFill}
            style={progress.kind === 'determinate' ? { width: `${progress.percent}%` } : undefined}
          />
        </div>
      ) : null}
    </div>
  )
}
