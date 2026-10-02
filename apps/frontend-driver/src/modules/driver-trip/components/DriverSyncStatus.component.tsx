/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { resolveSyncAge } from '../shared/syncStatus.service'
import styles from '../styles/driverTrip.module.css'

/** O relógio da tela anda sozinho: sem isto "há 2 min" congela em 2 até algum outro estado mudar. */
const SYNC_AGE_TICK_MS = 15_000

type DriverSyncStatusProps = Readonly<{
  isSyncing: boolean
  /** `0` é "nunca sincronizou nesta sessão" — `dataUpdatedAt` do TanStack Query nasce assim. */
  lastSyncedAtMs: number
  /** Quantos itens a drenagem ainda pode levar — o que de fato está esperando. */
  pendingCount: number
}>

/**
 * Pedido do usuário (01/10): a tela de pendências precisa mostrar a sincronização acontecendo
 * enquanto a app está aberta, com loading. A drenagem é offline-first e só roda em primeiro plano
 * (sem Background Sync — `security.md` §8, ADR-0056), então este é o único lugar onde o motorista
 * descobre que algo ficou para trás.
 */
export function DriverSyncStatus({
  isSyncing,
  lastSyncedAtMs,
  pendingCount,
}: DriverSyncStatusProps) {
  const { t } = useTranslation('driverTrip')
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), SYNC_AGE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const age = resolveSyncAge({ nowMs, syncedAtMs: lastSyncedAtMs })

  /** `aria-live` no contêiner, não no texto: o leitor de tela anuncia a troca sem relê-la a cada tick. */
  return (
    <p aria-live="polite" className={styles.syncStatus} role="status">
      {isSyncing ? (
        <>
          <span aria-hidden="true" className={styles.syncStatusSpinner} />
          {t('sync.syncing', { count: pendingCount })}
        </>
      ) : (
        <>
          <Icon aria-hidden="true" name="check" size="sm" />
          {age === undefined
            ? t('sync.never')
            : age.unit === 'now'
              ? t('sync.now')
              : t(age.unit === 'minutes' ? 'sync.minutes' : 'sync.hours', { count: age.value })}
        </>
      )}
    </p>
  )
}
