/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  PICKUP_NOTIFY_BATCH_SIZE,
  PICKUP_NOTIFY_MAX_ATTEMPTS,
  PICKUP_NOTIFY_RETRY_MINUTES,
  PICKUP_REQUEST_STALE_ALERT_HOURS,
} from '../domain/pickup-request-notify.constant.js'
import { buildPickupNotificationMessage } from '../domain/pickup-request-notify-message.policy.js'
import type {
  PendingPickupNotification,
  PickupRequestNotifyPorts,
} from './pickup-request-notify.port.js'

export type PickupRequestNotifyRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly ports: PickupRequestNotifyPorts
}

type Counters = {
  expired: number
  failed: number
  retried: number
  sent: number
  skipped: number
  stale: number
}

/** O intervalo antes da tentativa seguinte, em minutos (a última faixa se repete). */
export function retryDelayMinutes(attemptsDone: number): number {
  const index = Math.min(Math.max(attemptsDone - 1, 0), PICKUP_NOTIFY_RETRY_MINUTES.length - 1)
  return PICKUP_NOTIFY_RETRY_MINUTES[index] ?? 480
}

/**
 * Spec 339 T4: o ciclo faz três coisas, nesta ordem — expira o pedido sem decisão, marca o parado (cada um grava o seu
 * aviso na caixa de saída) e entrega os avisos vencidos, em lote, com tentativas. A API só grava a linha; nada do que é
 * lento ou externo acontece na requisição. Aviso sem contato ou sem canal vira `skipped`; falha de provedor reagenda
 * com espera crescente até o teto e então vira `failed`.
 */
export function createPickupRequestNotifyRoutine(
  dependencies: PickupRequestNotifyRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: PickupRequestNotifyRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const { ports } = dependencies
  const now = dependencies.now()
  const counters: Counters = { expired: 0, failed: 0, retried: 0, sent: 0, skipped: 0, stale: 0 }

  counters.expired = await ports.sweep.expireDue({ now })
  counters.stale = await ports.sweep.markStale({
    now,
    olderThanHours: PICKUP_REQUEST_STALE_ALERT_HOURS,
  })

  // Lotes até esvaziar ou até pedirem para parar: o que sobrar espera o ciclo seguinte, sem perda.
  for (let batch = 0; batch < 20 && !context.isStopRequested(); batch += 1) {
    const claimed = await ports.outbox.claim({
      limit: PICKUP_NOTIFY_BATCH_SIZE,
      now: dependencies.now(),
    })
    if (claimed.length === 0) break
    for (const notification of claimed) {
      if (context.isStopRequested()) break
      await deliverOne({ counters, dependencies, notification })
    }
    if (claimed.length < PICKUP_NOTIFY_BATCH_SIZE) break
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'pickup_request_notify_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
    },
  })
  return { counters: { ...counters }, outcome: 'succeeded' }
}

async function deliverOne(input: {
  readonly counters: Counters
  readonly dependencies: PickupRequestNotifyRoutineDependencies
  readonly notification: PendingPickupNotification
}): Promise<void> {
  const { counters, dependencies, notification } = input
  const { ports } = dependencies
  const { request } = notification
  const link = notification.audience === 'office' ? ports.links.office : ports.links.portal
  const message = buildPickupNotificationMessage({
    audience: notification.audience,
    event: notification.event,
    link,
    request,
  })
  try {
    if (notification.channel === 'whatsapp') {
      if (notification.audience !== 'client' || request.requesterPhone === null) {
        await ports.outbox.markSkipped({ id: notification.id, reason: 'no_whatsapp_contact' })
        counters.skipped += 1
        return
      }
      await ports.delivery.whatsapp({
        body: `${message.subject}\n\n${message.body}`,
        companyId: notification.companyId,
        number: request.requesterPhone,
      })
    } else {
      const to =
        notification.audience === 'office'
          ? await ports.delivery.officeEmails({ companyId: notification.companyId })
          : request.requesterEmail === null
            ? []
            : [request.requesterEmail]
      if (to.length === 0) {
        await ports.outbox.markSkipped({ id: notification.id, reason: 'no_email_recipient' })
        counters.skipped += 1
        return
      }
      await ports.delivery.email({
        body: message.body,
        companyId: notification.companyId,
        idempotencyKey: `pickup-request:${notification.id}`,
        subject: message.subject,
        to,
      })
    }
    await ports.outbox.markSent({ id: notification.id, now: dependencies.now() })
    counters.sent += 1
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : 'unknown'
    safeLogWarn({
      logger: dependencies.logger,
      message: 'pickup_request_notify_delivery_failed',
      metadata: {
        attempts: notification.attempts,
        channel: notification.channel,
        error: reason,
        id: notification.id,
      },
    })
    if (notification.attempts >= PICKUP_NOTIFY_MAX_ATTEMPTS) {
      await ports.outbox.markFailed({ error: reason, id: notification.id })
      counters.failed += 1
      return
    }
    const availableAt = new Date(
      dependencies.now().getTime() + retryDelayMinutes(notification.attempts) * 60_000,
    )
    await ports.outbox.markRetry({ availableAt, error: reason, id: notification.id })
    counters.retried += 1
  }
}
