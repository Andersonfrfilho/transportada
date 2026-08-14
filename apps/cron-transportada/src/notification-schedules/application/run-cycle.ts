/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NotificationSchedule } from '@adatechnology/notification-module'

import type { CronCycleResult, CronLogger } from '../../config/cron.types.js'

type RunNotificationSchedulesCycleParams = {
  readonly correlationId: string
  readonly jobId: string
  readonly logger: CronLogger
  readonly schedules: readonly NotificationSchedule[]
}

/**
 * O processo é one-shot: cada janela roda **todas** as rotinas do módulo uma vez, em vez de
 * interpretar o `cronExpression` que elas declaram — quem agenda é o CronJob lá fora. As três são
 * idempotentes (despachar o que venceu, expirar, purgar retenção), então rodar de novo não duplica.
 */
export async function runNotificationSchedulesCycle(
  params: RunNotificationSchedulesCycleParams,
): Promise<CronCycleResult> {
  let succeeded = 0
  let failed = 0

  for (const schedule of params.schedules) {
    try {
      await schedule.run()
      succeeded += 1
    } catch (error) {
      // Uma rotina que quebra não leva as outras junto: a purga não depende do despacho, e a
      // próxima janela só vem daqui a uma cadência inteira.
      failed += 1
      params.logger.error('notification_schedule_failed', {
        correlationId: params.correlationId,
        jobId: params.jobId,
        reason: error instanceof Error ? error.message : 'unknown',
        schedule: schedule.name,
      })
    }
  }

  return {
    acquiredLock: true,
    eligibleCount: params.schedules.length,
    enqueuedCount: succeeded,
    failedCount: failed,
    ineligibleCounts: {},
    skippedCount: 0,
  }
}
