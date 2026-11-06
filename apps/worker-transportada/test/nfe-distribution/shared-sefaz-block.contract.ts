/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O 656 vale para o serviço NFeDistribuicaoDFe inteiro: o da distribuição trava a busca por chave
 * e o da busca por chave trava a distribuição, sem a distribuição gastar a cota de 15 por hora.
 */
import { FiscalRejectionError } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_CONFIG,
  DISTRIBUTION_ENVELOPE,
  SILENT_LOGGER,
  type NfeDistributionCursorRepositoryPort,
  type SefazBudgetPort,
  createNfeDistributionConsumerFixture,
} from './nfe-distribution.fixture.js'

const NOW = new Date('2026-11-06T12:00:00.000Z')

function buildHarness(options: {
  readonly blockedUntil: Date | null
  readonly consultarDFe?: () => Promise<never>
  readonly readFails?: boolean
}) {
  const calls: string[] = []
  const sefazBudget: SefazBudgetPort = {
    async block656(input) {
      calls.push(`block656:${input.companyId}:${input.environment}:${input.now.toISOString()}`)
    },
    async readBlockedUntil() {
      if (options.readFails === true) throw new Error('budget read failed')
      return options.blockedUntil
    },
  }
  const cursorRepository: NfeDistributionCursorRepositoryPort = {
    async acquireLease(input) {
      return {
        companyId: input.companyId,
        consecutiveRateLimits: 0,
        environment: input.environment,
        leaseExpiresAt: null,
        leaseOwner: input.owner,
        maxNsu: '000000000000000',
        nextAllowedAt: null,
        ultNsu: '000000000000000',
        version: 1n,
      }
    },
    async releaseLease() {
      calls.push('release')
    },
    async resyncCursor() {},
    async saveCursor() {
      calls.push('saveCursor')
    },
  }
  const consumerPromise = createNfeDistributionConsumerFixture({
    clock: { now: () => NOW },
    cursorRepository,
    gatewayFactory: {
      create: () => ({
        async consultarDFe() {
          calls.push('consultarDFe')
          return (
            options.consultarDFe?.() ?? {
              itens: [],
              maxNSU: '000000000000000',
              temMais: false,
              ultNSU: '000000000000000',
            }
          )
        },
      }),
    },
    leaseMs: 30_000,
    logger: SILENT_LOGGER,
    profile: { loadConfig: async () => DISTRIBUTION_CONFIG },
    repository: {
      async finalizeImport() {
        calls.push('finalize')
      },
      async persistPage() {
        throw new Error('nothing to persist')
      },
    },
    sefazBudget,
  })
  return { calls, consumerPromise }
}

describe('shared 656 block between distribution and access key lookup', () => {
  test('a 656 from the pull blocks the lookups of that company and environment', async () => {
    const harness = buildHarness({
      blockedUntil: null,
      consultarDFe: () =>
        Promise.reject(new FiscalRejectionError('656', 'Consumo Indevido', '<retDistDFeInt/>')),
    })

    const consumer = await harness.consumerPromise
    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(harness.calls).toContain(
      `block656:${DISTRIBUTION_ENVELOPE.companyId}:homologation:${NOW.toISOString()}`,
    )
  })

  test('a 656 opened by a lookup pauses the pull before it queries SEFAZ', async () => {
    const harness = buildHarness({ blockedUntil: new Date(NOW.getTime() + 60_000) })

    const consumer = await harness.consumerPromise
    const result = await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(result.status).toBe('rate-limited')
    expect(harness.calls).not.toContain('consultarDFe')
    expect(harness.calls).toContain('finalize')
    expect(harness.calls).toContain('release')
    expect(harness.calls.some((call) => call.startsWith('block656'))).toBe(false)
  })

  test('a block that already ended does not stop the pull, and the pull never spends the lookup budget', async () => {
    const harness = buildHarness({ blockedUntil: new Date(NOW.getTime() - 1) })

    const consumer = await harness.consumerPromise
    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(harness.calls).toContain('consultarDFe')
    expect(harness.calls.some((call) => call.startsWith('block656'))).toBe(false)
  })

  test('a failing budget read releases the lease', async () => {
    const harness = buildHarness({ blockedUntil: null, readFails: true })

    const consumer = await harness.consumerPromise
    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).rejects.toThrow(
      'budget read failed',
    )

    expect(harness.calls).toEqual(['release'])
  })
})
