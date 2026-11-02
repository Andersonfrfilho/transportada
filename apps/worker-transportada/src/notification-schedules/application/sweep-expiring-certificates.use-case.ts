/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import {
  buildCertificateExpiryNotification,
  CERTIFICATE_EXPIRY_WARNING_DAYS,
  classifyCertificateExpiry,
} from '../../notification/domain/notification-trigger.policy.js'
import type { NotificationSendPort } from '../../notification/application/notification-trigger.service.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../../notification/notification.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  toNotificationSchedulesFailureCause,
  type NotificationSchedulesFailureCause,
} from '../domain/notification-schedules-failure.policy.js'

import type { ExpiringCertificate } from '../infrastructure/drizzle-expiring-certificates.query.js'

const MILLISECONDS_PER_DAY = 86_400_000

export type SweepExpiringCertificatesResult = {
  readonly failures: readonly NotificationSchedulesFailureCause[]
  readonly notifiedCount: number
  readonly sweptCount: number
}

export type SweepExpiringCertificates = (input: {
  readonly now: Date
}) => Promise<SweepExpiringCertificatesResult>

export type CreateSweepExpiringCertificatesParams = {
  readonly logger: WorkerLogger
  readonly selectExpiringCertificates: (input: {
    readonly until: Date
  }) => Promise<readonly ExpiringCertificate[]>
  readonly send: NotificationSendPort
}

/**
 * Uma batida avisa uma vez por degrau da régua (30, 15, 7, 3 e 1 dia) e uma vez quando vence: a
 * deduplicação é da chave, então a rotina de cinco em cinco minutos não repete. Como o aviso é o
 * trabalho do ciclo, a falha **não é engolida** — mesma regra da fatura a vencer.
 */
export function createSweepExpiringCertificates({
  logger,
  selectExpiringCertificates,
  send,
}: CreateSweepExpiringCertificatesParams): SweepExpiringCertificates {
  const widestWindowDays = Math.max(...CERTIFICATE_EXPIRY_WARNING_DAYS)

  return async function sweep({ now }) {
    const certificates = await selectExpiringCertificates({
      until: new Date(now.getTime() + widestWindowDays * MILLISECONDS_PER_DAY),
    })

    const failures: NotificationSchedulesFailureCause[] = []
    let notifiedCount = 0

    for (const certificate of certificates) {
      const stage = classifyCertificateExpiry({ expiresAt: certificate.expiresAt, now })
      if (stage === null) continue

      const notification = buildCertificateExpiryNotification({
        certificateId: certificate.id,
        companyId: certificate.companyId,
        expiresAt: certificate.expiresAt,
        recipientUserId: certificate.createdByUserId,
        stage,
      })

      try {
        await send({ ...notification, locale: NOTIFICATION_DEFAULT_LOCALE })
        notifiedCount += 1
      } catch (error: unknown) {
        failures.push(toNotificationSchedulesFailureCause(error))
        safeLogWarn({
          logger,
          message: 'certificate_expiry_notify_failed',
          metadata: {
            certificateId: certificate.id,
            companyId: certificate.companyId,
            reason: error instanceof Error ? error.name : 'UnknownError',
          },
        })
      }
    }

    safeLogInfo({
      logger,
      message: 'certificate_expiry_swept',
      metadata: { count: certificates.length, notifiedCount },
    })

    return { failures, notifiedCount, sweptCount: certificates.length }
  }
}
