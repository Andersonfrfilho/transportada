/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ScheduledDistributionStatusFacts,
  ScheduledDistributionStatusPort,
} from '../../src/companies/application/scheduled-distribution-status.port.js'
import { createGetScheduledDistributionStatusUseCase } from '../../src/companies/application/get-scheduled-distribution-status.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-08-05T21:00:00.000Z')

function facts(
  overrides: Partial<ScheduledDistributionStatusFacts> = {},
): ScheduledDistributionStatusFacts {
  return {
    certificate: {
      expiresAt: new Date('2026-11-05T16:34:24.000Z'),
      status: 'active',
      validFrom: new Date('2025-11-05T16:34:24.000Z'),
    },
    companyStatus: 'active',
    hasSyntheticMembership: true,
    lastAutomationImport: undefined,
    nextAllowedAt: undefined,
    nextScheduledRunAt: new Date('2026-08-05T21:15:00.000Z'),
    scheduledDistributionEnabled: true,
    ...overrides,
  }
}

function createUseCase(
  statusFacts: ScheduledDistributionStatusFacts,
): ReturnType<typeof createGetScheduledDistributionStatusUseCase> {
  const port: ScheduledDistributionStatusPort = {
    loadStatusFacts: () => Promise.resolve(statusFacts),
  }
  return createGetScheduledDistributionStatusUseCase({ clock: { now: () => NOW }, port })
}

describe('scheduled distribution status use case', () => {
  test('reports an eligible company with no pending reason', async () => {
    const status = await createUseCase(facts()).execute({ companyId: COMPANY_ID })

    expect(status).toEqual({
      certificateExpiresAt: '2026-11-05T16:34:24.000Z',
      companyId: COMPANY_ID,
      eligible: true,
      enabled: true,
      ineligibilityReason: undefined,
      lastAutomationImport: undefined,
      nextAllowedAt: undefined,
      nextScheduledRunAt: '2026-08-05T21:15:00.000Z',
    })
  })

  test('a próxima batida vem do relógio das rotinas, não de uma expressão de cron', async () => {
    const status = await createUseCase(
      facts({ nextScheduledRunAt: new Date('2026-08-05T23:40:00.000Z') }),
    ).execute({ companyId: COMPANY_ID })

    expect(status.nextScheduledRunAt).toBe('2026-08-05T23:40:00.000Z')
  })

  test('rotina pausada não anuncia próxima execução', async () => {
    const status = await createUseCase(facts({ nextScheduledRunAt: undefined })).execute({
      companyId: COMPANY_ID,
    })

    expect(status.nextScheduledRunAt).toBeUndefined()
  })

  test('reports the blocking reason when the operator never opted in', async () => {
    const status = await createUseCase(facts({ scheduledDistributionEnabled: false })).execute({
      companyId: COMPANY_ID,
    })

    expect(status.eligible).toBe(false)
    expect(status.enabled).toBe(false)
    expect(status.ineligibilityReason).toBe('not_opted_in')
  })

  test('reports the missing synthetic membership even with the flag already on', async () => {
    const status = await createUseCase(facts({ hasSyntheticMembership: false })).execute({
      companyId: COMPANY_ID,
    })

    expect(status.enabled).toBe(true)
    expect(status.ineligibilityReason).toBe('missing_synthetic_membership')
  })

  test('reports the cooldown as a reason and exposes when it lifts', async () => {
    const nextAllowedAt = new Date('2026-08-05T21:30:00.000Z')
    const status = await createUseCase(facts({ nextAllowedAt })).execute({ companyId: COMPANY_ID })

    expect(status.eligible).toBe(false)
    expect(status.ineligibilityReason).toBe('cooldown_active')
    expect(status.nextAllowedAt).toBe('2026-08-05T21:30:00.000Z')
  })

  test('omits the certificate expiry when no certificate is installed', async () => {
    const status = await createUseCase(facts({ certificate: undefined })).execute({
      companyId: COMPANY_ID,
    })

    expect(status.certificateExpiresAt).toBeUndefined()
    expect(status.ineligibilityReason).toBe('certificate_missing')
  })

  test('carries the newest automation import so the screen can show what it brought', async () => {
    const status = await createUseCase(
      facts({
        lastAutomationImport: {
          finishedAt: new Date('2026-08-05T20:05:00.000Z'),
          receivedCount: 17,
          startedAt: new Date('2026-08-05T20:00:00.000Z'),
          status: 'completed',
        },
      }),
    ).execute({ companyId: COMPANY_ID })

    expect(status.lastAutomationImport).toEqual({
      finishedAt: '2026-08-05T20:05:00.000Z',
      receivedCount: 17,
      startedAt: '2026-08-05T20:00:00.000Z',
      status: 'completed',
    })
  })

  test('keeps a still-running automation import without a finish timestamp', async () => {
    const status = await createUseCase(
      facts({
        lastAutomationImport: {
          finishedAt: undefined,
          receivedCount: 0,
          startedAt: new Date('2026-08-05T20:59:00.000Z'),
          status: 'processing',
        },
      }),
    ).execute({ companyId: COMPANY_ID })

    expect(status.lastAutomationImport?.finishedAt).toBeUndefined()
    expect(status.lastAutomationImport?.status).toBe('processing')
  })
})
