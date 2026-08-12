/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A tela sabia dizer "o próximo ciclo vai buscar notas" mas não sabia dizer quando: a única
 * data servida era o cursor anti-656 da SEFAZ, que só nasce depois da primeira consulta. A
 * cadência do cron mora no `deploy/cron/railway.json` de outra app, então o valor entra por
 * ambiente — e este contrato guarda o padrão contra o arquivo real, para as duas pontas não
 * contarem histórias diferentes.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

import {
  isSupportedScheduleExpression,
  resolveNextScheduledRunAt,
  UnsupportedScheduleExpressionError,
} from '../../src/companies/domain/scheduled-distribution-window.policy.js'
import { DEFAULT_SCHEDULED_DISTRIBUTION_CRON } from '../../src/config/scheduled-distribution.constant.js'
import { parseEnvironment } from '../../src/config/environment.schema.js'
import type { ScheduledDistributionStatusPort } from '../../src/companies/application/scheduled-distribution-status.port.js'
import { createGetScheduledDistributionStatusUseCase } from '../../src/companies/application/get-scheduled-distribution-status.use-case.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const CRON_RAILWAY_CONFIG_PATH = '../../../../deploy/cron/railway.json'

describe('scheduled distribution window policy', () => {
  test.each([
    ['0 * * * *', '2026-08-05T21:00:00.000Z', '2026-08-05T22:00:00.000Z'],
    ['0 * * * *', '2026-08-05T21:00:00.001Z', '2026-08-05T22:00:00.000Z'],
    ['0 * * * *', '2026-08-05T21:59:59.999Z', '2026-08-05T22:00:00.000Z'],
    ['0 * * * *', '2026-08-05T23:30:00.000Z', '2026-08-06T00:00:00.000Z'],
    ['30 * * * *', '2026-08-05T21:00:00.000Z', '2026-08-05T21:30:00.000Z'],
    ['30 * * * *', '2026-08-05T21:30:00.000Z', '2026-08-05T22:30:00.000Z'],
    ['*/15 * * * *', '2026-08-05T21:07:00.000Z', '2026-08-05T21:15:00.000Z'],
    ['*/15 * * * *', '2026-08-05T21:50:00.000Z', '2026-08-05T22:00:00.000Z'],
    ['*/7 * * * *', '2026-08-05T21:57:00.000Z', '2026-08-05T22:00:00.000Z'],
    ['* * * * *', '2026-08-05T21:07:30.000Z', '2026-08-05T21:08:00.000Z'],
  ])('resolves %s from %s to %s', (cronExpression, from, expected) => {
    const next = resolveNextScheduledRunAt({ cronExpression, from: new Date(from) })

    expect(next.toISOString()).toBe(expected)
  })

  test('always lands strictly in the future, never on the instant asked about', () => {
    const from = new Date('2026-08-05T22:00:00.000Z')

    const next = resolveNextScheduledRunAt({ cronExpression: '0 * * * *', from })

    expect(next.getTime()).toBeGreaterThan(from.getTime())
  })

  test.each([
    ['0 3 * * *', 'hora fixa'],
    ['0 * 1 * *', 'dia do mês'],
    ['0 * * 1 *', 'mês'],
    ['0 * * * 1', 'dia da semana'],
    ['0,30 * * * *', 'lista de minutos'],
    ['0-30 * * * *', 'intervalo de minutos'],
    ['0 *', 'expressão incompleta'],
    ['*/0 * * * *', 'passo zero'],
    ['60 * * * *', 'minuto fora da faixa'],
    ['', 'vazia'],
  ])('refuses %s (%s) instead of inventing a window', (cronExpression) => {
    expect(isSupportedScheduleExpression(cronExpression)).toBe(false)
    expect(() => resolveNextScheduledRunAt({ cronExpression, from: new Date() })).toThrow(
      UnsupportedScheduleExpressionError,
    )
  })

  test('accepts exactly the shapes the cron service can be configured with', () => {
    for (const cronExpression of ['0 * * * *', '30 * * * *', '*/15 * * * *', '* * * * *']) {
      expect(isSupportedScheduleExpression(cronExpression)).toBe(true)
    }
  })
})

describe('scheduled distribution cadence configuration', () => {
  test('the default matches the schedule the cron service actually runs on', () => {
    const railwayConfig = JSON.parse(
      readFileSync(new URL(CRON_RAILWAY_CONFIG_PATH, import.meta.url), 'utf8'),
    ) as { readonly deploy: { readonly cronSchedule: string } }

    expect(DEFAULT_SCHEDULED_DISTRIBUTION_CRON).toBe(railwayConfig.deploy.cronSchedule)
  })

  test('falls back to the default when the environment says nothing', () => {
    expect(parseEnvironment({ ...API_ENVIRONMENT }).scheduledDistributionCron).toBe(
      DEFAULT_SCHEDULED_DISTRIBUTION_CRON,
    )
  })

  test('accepts an override so a slower environment can tell the truth', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      SCHEDULED_DISTRIBUTION_CRON: '*/15 * * * *',
    })

    expect(environment.scheduledDistributionCron).toBe('*/15 * * * *')
  })

  test('refuses to boot with a cadence the policy cannot resolve', () => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, SCHEDULED_DISTRIBUTION_CRON: '0 3 * * *' }),
    ).toThrow()
  })
})

describe('scheduled distribution status use case with the next window', () => {
  test('answers when the next cycle runs even before any cycle has ever run', async () => {
    const status = await createUseCase({ now: new Date('2026-08-05T21:17:00.000Z') }).execute({
      companyId: COMPANY_ID,
    })

    expect(status.nextScheduledRunAt).toBe('2026-08-05T21:30:00.000Z')
    expect(status.nextAllowedAt).toBeUndefined()
  })

  test('keeps the cron window independent of the SEFAZ cooldown', async () => {
    const status = await createUseCase({
      nextAllowedAt: new Date('2026-08-05T23:30:00.000Z'),
      now: new Date('2026-08-05T21:17:00.000Z'),
    }).execute({ companyId: COMPANY_ID })

    expect(status.nextScheduledRunAt).toBe('2026-08-05T21:30:00.000Z')
    expect(status.nextAllowedAt).toBe('2026-08-05T23:30:00.000Z')
    expect(status.ineligibilityReason).toBe('cooldown_active')
  })

  test('still answers the window when the operator never opted in', async () => {
    const status = await createUseCase({
      now: new Date('2026-08-05T21:17:00.000Z'),
      scheduledDistributionEnabled: false,
    }).execute({ companyId: COMPANY_ID })

    expect(status.enabled).toBe(false)
    expect(status.nextScheduledRunAt).toBe('2026-08-05T21:30:00.000Z')
  })
})

function createUseCase(overrides: {
  readonly nextAllowedAt?: Date
  readonly now: Date
  readonly scheduledDistributionEnabled?: boolean
}): ReturnType<typeof createGetScheduledDistributionStatusUseCase> {
  const port: ScheduledDistributionStatusPort = {
    loadStatusFacts: () =>
      Promise.resolve({
        certificate: {
          expiresAt: new Date('2026-11-05T16:34:24.000Z'),
          status: 'active',
          validFrom: new Date('2025-11-05T16:34:24.000Z'),
        },
        companyStatus: 'active',
        hasSyntheticMembership: true,
        lastAutomationImport: undefined,
        nextAllowedAt: overrides.nextAllowedAt,
        scheduledDistributionEnabled: overrides.scheduledDistributionEnabled ?? true,
      }),
  }

  return createGetScheduledDistributionStatusUseCase({
    clock: { now: () => overrides.now },
    port,
    scheduledDistributionCron: DEFAULT_SCHEDULED_DISTRIBUTION_CRON,
  })
}
