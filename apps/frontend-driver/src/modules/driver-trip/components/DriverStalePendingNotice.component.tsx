/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { formatQueuedAt } from '../shared/stalePending.service'
import styles from '../styles/driverTrip.module.css'

type DriverStalePendingNoticeProps = Readonly<{
  count: number
  oldestQueuedAt: string
  onOpenQueue: () => void
}>

/**
 * Spec 229: o que o aparelho guardou e não conseguiu enviar há mais de um dia. Só avisa — nada é
 * apagado (spec 227) —, e o toque leva à tela de pendências, onde o envio manual está.
 */
export function DriverStalePendingNotice({
  count,
  onOpenQueue,
  oldestQueuedAt,
}: DriverStalePendingNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const date = formatQueuedAt({ nowMs: Date.now(), queuedAt: oldestQueuedAt })

  return (
    <button className={styles.stalePendingNotice} role="alert" type="button" onClick={onOpenQueue}>
      <Icon aria-hidden="true" name="clock" size="sm" />
      <span>{t('stalePending.notice', { count, date })}</span>
      <span className={styles.queueBannerAction}>{t('eventQueue.open')}</span>
    </button>
  )
}
