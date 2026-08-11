/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FiscalRejectionError } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_CONFIG,
  DISTRIBUTION_ENVELOPE,
  SILENT_LOGGER,
  type DistributionCursorRecord,
  type NfeDistributionCursorRepositoryPort,
  createDistributionItem,
  createNfeDistributionConsumerFixture,
} from './nfe-distribution.fixture.js'

const NOW = new Date('2026-08-11T14:00:00.000Z')

function createRateLimitError(): FiscalRejectionError {
  return new FiscalRejectionError('656', 'Rejeicao: Consumo Indevido', '<retDistDFeInt/>')
}

describe('NF-e distribution cursor recovery contract', () => {
  test('advances the cursor and records the skipped range when the page fails to persist', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      maxNsu: '000000000000200',
      ultNsu: '000000000000100',
    })
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => NOW },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
              return {
                itens: [
                  createDistributionItem({
                    accessKey: '35190730290856000160550010000000011000000101',
                    nsu: '000000000000101',
                  }),
                ],
                maxNSU: '000000000000200',
                temMais: true,
                ultNSU: '000000000000150',
              }
            },
          }
        },
      },
      leaseMs: 30_000,
      logger: SILENT_LOGGER,
      profile: {
        async loadConfig() {
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async finalizeImport(input) {
          calls.push(`finalize:${input.status}:${input.receivedCount}:${input.importedCount}`)
        },
        async persistPage() {
          throw new Error('storage unavailable')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 1,
      persistedCount: 0,
      status: 'completed',
      ultNsu: '000000000000150',
    })

    // O cursor acompanha a SEFAZ mesmo sem persistir: ficar atrás bloqueia o CNPJ inteiro
    expect(calls).toContain(
      'cursor:000000000000150:000000000000200:open:0:skipped=000000000000101-000000000000150',
    )
    expect(calls).not.toContain('consultarDFe:000000000000150')
  })

  test('resyncs to maxNsu after the second consecutive refusal with the cursor behind', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      consecutiveRateLimits: 1,
      maxNsu: '000000000045636',
      ultNsu: '000000000037701',
    })
    const consumer = await createConsumerRefusedBySefaz({ calls, cursorRepository })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 0,
      persistedCount: 0,
      status: 'rate-limited',
      ultNsu: '000000000037701',
    })

    expect(calls).toContain('resync:000000000037701-000000000045636')
    expect(calls).not.toContain('cursor:000000000037701:000000000045636:blocked:2')
  })

  test('counts the first refusal without moving the cursor', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      maxNsu: '000000000045636',
      ultNsu: '000000000037701',
    })
    const consumer = await createConsumerRefusedBySefaz({ calls, cursorRepository })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(calls).toContain('cursor:000000000037701:000000000045636:blocked:1')
    expect(calls.some((call) => call.startsWith('resync:'))).toBe(false)
  })

  test('never resyncs while the cursor already sits at maxNsu', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      consecutiveRateLimits: 4,
      maxNsu: '000000000045636',
      ultNsu: '000000000045636',
    })
    const consumer = await createConsumerRefusedBySefaz({ calls, cursorRepository })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    // Cursor na marca d'água com 656 é a espera legítima do §3.11.4.1 causa 1
    expect(calls.some((call) => call.startsWith('resync:'))).toBe(false)
    expect(calls).toContain('cursor:000000000045636:000000000045636:blocked:5')
  })

  test('zeroes the refusal counter on an answered page', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      consecutiveRateLimits: 1,
      maxNsu: '000000000000200',
      ultNsu: '000000000000100',
    })
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => NOW },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe() {
              return {
                itens: [
                  createDistributionItem({
                    accessKey: '35190730290856000160550010000000011000000101',
                    nsu: '000000000000101',
                  }),
                ],
                maxNSU: '000000000000200',
                temMais: false,
                ultNSU: '000000000000101',
              }
            },
          }
        },
      },
      leaseMs: 30_000,
      logger: SILENT_LOGGER,
      profile: {
        async loadConfig() {
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async finalizeImport() {
          /* noop */
        },
        async persistPage() {
          return { acceptedCount: 1, duplicatedCount: 0, skippedCount: 0 }
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(calls).toContain('cursor:000000000000101:000000000000200:open:0')
  })

  test('zeroes the refusal counter on an empty page', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      consecutiveRateLimits: 1,
      maxNsu: '000000000000200',
      ultNsu: '000000000000200',
    })
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => NOW },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              return {
                itens: [],
                maxNSU: '000000000000200',
                temMais: false,
                ultNSU: input.ultNSU,
              }
            },
          }
        },
      },
      leaseMs: 30_000,
      logger: SILENT_LOGGER,
      profile: {
        async loadConfig() {
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async finalizeImport() {
          /* noop */
        },
        async persistPage() {
          throw new Error('No documents should be persisted on an empty page')
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(calls).toContain('cursor:000000000000200:000000000000200:blocked:0')
  })
})

async function createConsumerRefusedBySefaz(input: {
  readonly calls: string[]
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
}): ReturnType<typeof createNfeDistributionConsumerFixture> {
  return createNfeDistributionConsumerFixture({
    clock: { now: () => NOW },
    cursorRepository: input.cursorRepository,
    gatewayFactory: {
      create() {
        return {
          async consultarDFe(params) {
            input.calls.push(`consultarDFe:${params.ultNSU}`)
            throw createRateLimitError()
          },
        }
      },
    },
    leaseMs: 30_000,
    logger: SILENT_LOGGER,
    profile: {
      async loadConfig() {
        return DISTRIBUTION_CONFIG
      },
    },
    repository: {
      async finalizeImport(params) {
        input.calls.push(
          `finalize:${params.status}:${params.receivedCount}:${params.importedCount}`,
        )
      },
      async persistPage() {
        throw new Error('No page should be persisted after a refusal')
      },
    },
  })
}

function createCursorRepository(
  calls: string[],
  initialOverride?: Partial<DistributionCursorRecord>,
): NfeDistributionCursorRepositoryPort {
  let cursor: DistributionCursorRecord = {
    companyId: DISTRIBUTION_ENVELOPE.companyId,
    consecutiveRateLimits: 0,
    environment: 'homologation',
    leaseExpiresAt: null,
    leaseOwner: null,
    maxNsu: '000000000000000',
    nextAllowedAt: null,
    ultNsu: '000000000000000',
    version: 1n,
    ...initialOverride,
  }

  return {
    async acquireLease(input) {
      cursor = {
        ...cursor,
        environment: input.environment,
        leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
        leaseOwner: input.owner,
      }
      return cursor
    },
    async releaseLease() {
      cursor = { ...cursor, leaseExpiresAt: null, leaseOwner: null }
    },
    async resyncCursor(input) {
      calls.push(`resync:${input.skippedFromNsu}-${input.skippedToNsu}`)
      cursor = {
        ...cursor,
        consecutiveRateLimits: 0,
        nextAllowedAt: new Date(input.now.getTime() + 60 * 60 * 1000),
        ultNsu: input.ultNsu,
        version: cursor.version + 1n,
      }
    },
    async saveCursor(input) {
      const skipped =
        input.skipped === undefined
          ? ''
          : `:skipped=${input.skipped.fromNsu}-${input.skipped.toNsu}`
      calls.push(
        `cursor:${input.ultNsu}:${input.maxNsu}:${input.nextAllowedAt === null ? 'open' : 'blocked'}:${String(input.consecutiveRateLimits)}${skipped}`,
      )
      cursor = {
        ...cursor,
        consecutiveRateLimits: input.consecutiveRateLimits,
        maxNsu: input.maxNsu,
        nextAllowedAt: input.nextAllowedAt,
        ultNsu: input.ultNsu,
        version: cursor.version + 1n,
      }
    },
  }
}
