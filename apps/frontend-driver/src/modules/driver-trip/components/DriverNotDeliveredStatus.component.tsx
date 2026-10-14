/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'

import type { NotDeliveredStatus } from '../shared/notDelivered.service'
import { occurrenceProgressKey, proofUploadProgress } from '../shared/proofUploadProgress.service'
import styles from '../styles/driverTrip.module.css'
import { describeFailureKey, ProofUploadProgressBar } from './ProofUploadStatus.component'

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

type DriverNotDeliveredStatusProps = Readonly<{
  /** A chave de idempotência do toque: com ela a linha mostra a barra real e o motivo da última falha. */
  occurrenceKey?: string | undefined
  status: NotDeliveredStatus | undefined
}>

/**
 * Spec 179 RF5/CA05: "na fila" nunca se passa por "enviado" — a tela diz o que está gravado. Ícone e
 * cor acompanham o texto, que é quem carrega o sentido (o ícone é decorativo).
 */
export function DriverNotDeliveredStatus({ occurrenceKey, status }: DriverNotDeliveredStatusProps) {
  const { t } = useTranslation('driverTrip')
  const entries = useSyncExternalStore(
    proofUploadProgress.subscribe,
    proofUploadProgress.snapshot,
    proofUploadProgress.snapshot,
  )
  const progress =
    occurrenceKey === undefined ? undefined : entries[occurrenceProgressKey(occurrenceKey)]
  if (status === undefined) return null
  const view = STATUS_VIEW[status]

  return (
    <div className={`${styles.notDeliveredStatus} ${view.className}`} role="status">
      <Icon name={view.icon} />
      <span>{t(view.key)}</span>
      {status !== 'queued' || progress === undefined ? null : progress.failure === undefined ? (
        <ProofUploadProgressBar percent={progress.percent} />
      ) : (
        <span>
          {t('proofCapture.upload.lastTryFailed', {
            reason: t(describeFailureKey(progress.failure), { status: progress.failure.status }),
          })}
        </span>
      )}
    </div>
  )
}
