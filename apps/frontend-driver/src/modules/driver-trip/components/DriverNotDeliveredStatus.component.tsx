/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'

import type { NotDeliveredStatus } from '../shared/notDelivered.service'
import styles from '../styles/driverTrip.module.css'

const STATUS_VIEW: Readonly<
  Record<NotDeliveredStatus, Readonly<{ className: string; icon: IconName; key: string }>>
> = {
  queued: {
    className: styles.notDeliveredStatusQueued ?? '',
    icon: 'clock',
    key: 'notDelivered.status.queued',
  },
  rejected: {
    className: styles.notDeliveredStatusRejected ?? '',
    icon: 'alert',
    key: 'notDelivered.status.rejected',
  },
  sent: {
    className: styles.notDeliveredStatusSent ?? '',
    icon: 'check',
    key: 'notDelivered.status.sent',
  },
}

type DriverNotDeliveredStatusProps = Readonly<{ status: NotDeliveredStatus | undefined }>

/**
 * Spec 179 RF5/CA05: "na fila" nunca se passa por "enviado" — a tela diz o que está gravado. Ícone e
 * cor acompanham o texto, que é quem carrega o sentido (o ícone é decorativo).
 */
export function DriverNotDeliveredStatus({ status }: DriverNotDeliveredStatusProps) {
  const { t } = useTranslation('driverTrip')
  if (status === undefined) return null
  const view = STATUS_VIEW[status]

  return (
    <p className={`${styles.notDeliveredStatus} ${view.className}`} role="status">
      <Icon name={view.icon} />
      {t(view.key)}
    </p>
  )
}
