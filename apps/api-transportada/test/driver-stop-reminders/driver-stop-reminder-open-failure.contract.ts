/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 (revisão do PR 566): `open()` engole só falha do banco e registra o SQLSTATE; erro de programação propaga.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleDriverStopReminderRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder.repository.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'

type Warning = { message: string; metadata: Record<string, unknown> | undefined }

function buildRepository(failure: Error) {
  const warnings: Warning[] = []
  const logger: ApiLogger = {
    error: () => undefined,
    info: () => undefined,
    warn: (message, metadata) => void warnings.push({ message, metadata }),
  }
  const executor = {
    transaction: async () => {
      throw failure
    },
  } as unknown as TripQueryable
  return { repository: new DrizzleDriverStopReminderRepository(executor, logger), warnings }
}

const OPEN_PARAMS = {
  anchorAt: new Date('2026-11-06T10:00:00.000Z'),
  companyId: 'company-1',
  context: { driverId: 'driver-1', stopId: 'stop-1', tripId: 'trip-1' },
  dueAt: new Date('2026-11-06T11:00:00.000Z'),
  expectedAt: new Date('2026-11-06T10:45:00.000Z'),
  stage: 'arrival',
} as const

describe('abertura do lembrete que falha (spec 299)', () => {
  test('falha do banco é engolida e registra o SQLSTATE do driver do Bun (errno)', async () => {
    const databaseError = Object.assign(new Error('query failed'), {
      cause: Object.assign(new Error('reminder sink down'), {
        code: 'ERR_POSTGRES_SERVER_ERROR',
        errno: 'P0001',
      }),
    })
    const { repository, warnings } = buildRepository(databaseError)

    expect(await repository.open(OPEN_PARAMS)).toBeUndefined()
    expect(warnings).toEqual([
      {
        message: 'driver_stop_reminder_open_failed',
        metadata: {
          companyId: 'company-1',
          reason: 'Error',
          sqlState: 'P0001',
          stage: 'arrival',
          tripStopId: 'stop-1',
        },
      },
    ])
  })

  test('erro que não vem do banco propaga', async () => {
    const { repository, warnings } = buildRepository(new TypeError('bug de programação'))

    await expect(repository.open(OPEN_PARAMS)).rejects.toThrow('bug de programação')
    expect(warnings).toEqual([])
  })
})
