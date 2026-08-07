/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { resolveSecondsUntilNextRefresh } from '../shared/cteBatchProgress.service'
import styles from '../styles/cteBatch.module.css'

type RefreshCountdownProps = Readonly<{
  intervalMs: false | number
  updatedAt: number
}>

/**
 * A listagem se relê sozinha enquanto o worker deve uma transição. Sem contador o operador não
 * distingue "esperando a SEFAZ" de "tela travada" e aperta F5 no meio da emissão.
 */
export function RefreshCountdown({ intervalMs, updatedAt }: RefreshCountdownProps) {
  const { t } = useTranslation('cteBatch')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (intervalMs === false) return

    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)

    return () => window.clearInterval(timer)
  }, [intervalMs, updatedAt])

  if (intervalMs === false) return null

  const seconds = resolveSecondsUntilNextRefresh({ intervalMs, now, updatedAt })

  return (
    <p className={styles.refreshCountdown} role="status">
      <Icon aria-hidden="true" name="refresh" />
      {seconds === 0 ? t('refresh.now') : t('refresh.countdown', { seconds })}
    </p>
  )
}
