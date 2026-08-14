/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NotificationSchedule } from '@adatechnology/notification-module'

import type { CronLogger } from '../../src/config/cron.types.js'
import { runNotificationSchedulesCycle } from '../../src/notification-schedules/application/run-cycle.js'

function silentLogger(): CronLogger {
  return { error() {}, info() {}, warn() {} }
}

function schedule(name: string, run: () => Promise<void>): NotificationSchedule {
  return { cronExpression: '* * * * *', name, run }
}

describe('contrato do ciclo de rotinas de notificação', () => {
  test('roda toda rotina do módulo uma vez', async () => {
    const executed: string[] = []
    const result = await runNotificationSchedulesCycle({
      correlationId: 'trace',
      jobId: 'notification.schedules.run',
      logger: silentLogger(),
      schedules: [
        schedule('dispatch-due', async () => {
          executed.push('dispatch-due')
        }),
        schedule('purge-expired', async () => {
          executed.push('purge-expired')
        }),
      ],
    })

    expect(executed).toEqual(['dispatch-due', 'purge-expired'])
    expect(result.enqueuedCount).toBe(2)
    expect(result.failedCount).toBe(0)
  })

  // Uma rotina que quebra não pode levar as outras junto: a purga de retenção não depende do
  // despacho ter dado certo, e a janela seguinte é daqui a uma hora.
  test('uma rotina que falha não interrompe as demais', async () => {
    const executed: string[] = []
    const result = await runNotificationSchedulesCycle({
      correlationId: 'trace',
      jobId: 'notification.schedules.run',
      logger: silentLogger(),
      schedules: [
        schedule('dispatch-due', async () => {
          throw new Error('broker indisponível')
        }),
        schedule('purge-expired', async () => {
          executed.push('purge-expired')
        }),
      ],
    })

    expect(executed).toEqual(['purge-expired'])
    expect(result.enqueuedCount).toBe(1)
    expect(result.failedCount).toBe(1)
  })

  test('o ciclo sem rotina nenhuma não é falha', async () => {
    const result = await runNotificationSchedulesCycle({
      correlationId: 'trace',
      jobId: 'notification.schedules.run',
      logger: silentLogger(),
      schedules: [],
    })

    expect(result.failedCount).toBe(0)
    expect(result.eligibleCount).toBe(0)
  })
})
