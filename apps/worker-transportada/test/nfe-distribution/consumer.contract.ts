/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FiscalRejectionError } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import type { WorkerLogger } from '../../src/shared/worker.types.js'

import {
  DISTRIBUTION_CONFIG,
  DISTRIBUTION_ENVELOPE,
  SILENT_LOGGER,
  type DistributionCursorRecord,
  type NfeDistributionCursorRepositoryPort,
  createDistributionItem,
  createNfeDistributionConsumerFixture,
} from './nfe-distribution.fixture.js'

type LoggedEvent = {
  readonly message: string
  readonly metadata: Record<string, unknown> | undefined
}

function createSpyLogger(events: LoggedEvent[]): WorkerLogger {
  return {
    error() {},
    info(message, metadata) {
      events.push({ message, metadata })
    },
    warn() {},
  }
}

describe('NF-e distribution consumer contract', () => {
  test('consumes 51 DF-es across overlapping pages, persists a monotonic cursor, and deduplicates repeated NSUs', async () => {
    const calls: string[] = []
    const pageOne = Array.from({ length: 50 }, (_, index) =>
      createDistributionItem({
        accessKey: `351907302908560001605500100000000110000000${String(index + 10).padStart(2, '0')}`,
        nsu: String(index + 1).padStart(15, '0'),
      }),
    )
    const pageTwo = [
      createDistributionItem({
        accessKey: '35190730290856000160550010000000011000000059',
        nsu: '000000000000050',
      }),
      createDistributionItem({
        accessKey: '35190730290856000160550010000000011000000060',
        nsu: '000000000000051',
      }),
    ]
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:10:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
              if (input.ultNSU === '000000000000000') {
                return {
                  itens: pageOne,
                  maxNSU: '000000000000051',
                  temMais: true,
                  ultNSU: '000000000000050',
                }
              }

              return {
                itens: pageTwo,
                maxNSU: '000000000000051',
                temMais: false,
                ultNSU: '000000000000051',
              }
            },
          }
        },
      },
      leaseMs: 30_000,
      logger: SILENT_LOGGER,
      profile: {
        async loadConfig(input) {
          calls.push(`profile:${input.companyId}`)
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async finalizeImport(input) {
          calls.push(
            `finalize:${input.status}:${input.receivedCount}:${input.importedCount}:${input.duplicatedCount}`,
          )
        },
        async persistPage(input) {
          calls.push(`persist:${input.ultNsu}:${input.items.length}`)
          const acceptedCount =
            input.ultNsu === '000000000000050'
              ? input.items.length
              : input.items.filter((item) => item.nsu !== '000000000000050').length
          return {
            acceptedCount,
            duplicatedCount: input.items.length - acceptedCount,
            skippedCount: 0,
          }
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 1,
      fetchedCount: 52,
      persistedCount: 51,
      status: 'completed',
      ultNsu: '000000000000051',
    })

    expect(calls).toEqual([
      'profile:fbc033e7-63e0-4698-adc6-12778bedf4a7',
      'lease:fbc033e7-63e0-4698-adc6-12778bedf4a7:homologation:distribution-consumer',
      'consultarDFe:000000000000000',
      'persist:000000000000050:50',
      'cursor:000000000000050:000000000000051:open',
      'consultarDFe:000000000000050',
      'persist:000000000000051:2',
      'cursor:000000000000051:000000000000051:open',
      'finalize:completed:52:51:1',
      'release:fbc033e7-63e0-4698-adc6-12778bedf4a7:homologation:distribution-consumer',
    ])
  })

  test('persists an anti-656 window after an empty page and stops until nextAllowedAt expires', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:20:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
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
        async finalizeImport(input) {
          calls.push(
            `finalize:${input.status}:${input.receivedCount}:${input.importedCount}:${input.duplicatedCount}`,
          )
        },
        async persistPage() {
          throw new Error('No documents should be persisted on an empty page')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 0,
      persistedCount: 0,
      status: 'rate-limited',
      ultNsu: '000000000000000',
    })

    expect(calls).toContain('cursor:000000000000000:000000000000200:blocked')
    expect(calls).toContain('finalize:completed:0:0:0')
  })

  test('skips the SEFAZ call while still inside the persisted anti-656 window', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls, {
      maxNsu: '000000000000200',
      nextAllowedAt: new Date('2026-07-22T23:59:00.000Z'),
      ultNsu: '000000000000120',
    })
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:20:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
              throw new Error('SEFAZ must not be queried during the anti-656 cooldown window')
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
          calls.push(
            `finalize:${input.status}:${input.receivedCount}:${input.importedCount}:${input.duplicatedCount}`,
          )
        },
        async persistPage() {
          throw new Error('No documents should be persisted during the cooldown window')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 0,
      persistedCount: 0,
      status: 'rate-limited',
      ultNsu: '000000000000120',
    })

    expect(calls).not.toContain('consultarDFe:000000000000120')
    expect(calls).toContain('finalize:completed:0:0:0')
    expect(calls).toContain(
      `release:${DISTRIBUTION_ENVELOPE.companyId}:homologation:distribution-consumer`,
    )
  })
  /**
   * A SEFAZ recusa por 656 exigindo uma hora de silêncio no CNPJ. Enquanto essa recusa saía como
   * erro, o trilho de retry reentregava em segundos e cada tentativa rearmava o bloqueio — o CNPJ
   * nunca chegava a passar a hora calada. A recusa é desfecho, não falha: grava a janela e encerra.
   */
  test.each([
    [
      'the provider throws the parsed rate limit',
      () =>
        new Error(
          'SEFAZ NFeDistribuicaoDFe: rate limit atingido — aguarde 1 hora antes de consultar novamente o mesmo CNPJ (cStat 656)',
        ),
    ],
    [
      'the provider throws a typed 656 rejection',
      () => new FiscalRejectionError('656', 'Rejeicao: Consumo Indevido', '<retDistDFeInt/>'),
    ],
  ])('opens the anti-656 window instead of failing when %s', async (_name, createError) => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-08-10T15:00:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
              return Promise.reject(createError())
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
          calls.push(
            `finalize:${input.status}:${input.receivedCount}:${input.importedCount}:${input.duplicatedCount}`,
          )
        },
        async persistPage() {
          throw new Error('A refused pull must not persist documents')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 0,
      persistedCount: 0,
      status: 'rate-limited',
      ultNsu: '000000000000000',
    })

    expect(calls).toEqual([
      'lease:fbc033e7-63e0-4698-adc6-12778bedf4a7:homologation:distribution-consumer',
      'consultarDFe:000000000000000',
      'cursor:000000000000000:000000000000000:blocked',
      'finalize:completed:0:0:0',
      'release:fbc033e7-63e0-4698-adc6-12778bedf4a7:homologation:distribution-consumer',
    ])
  })

  test('keeps the pages it already persisted when the 656 lands mid-run', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-08-10T15:00:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            consultarDFe(input) {
              calls.push(`consultarDFe:${input.ultNSU}`)
              if (input.ultNSU === '000000000000000') {
                return Promise.resolve({
                  itens: [
                    createDistributionItem({
                      accessKey: '35190730290856000160550010000000011000000059',
                      nsu: '000000000000001',
                    }),
                  ],
                  maxNSU: '000000000000090',
                  temMais: true,
                  ultNSU: '000000000000001',
                })
              }

              return Promise.reject(
                new FiscalRejectionError('656', 'Rejeicao: Consumo Indevido', '<retDistDFeInt/>'),
              )
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
          calls.push(
            `finalize:${input.status}:${input.receivedCount}:${input.importedCount}:${input.duplicatedCount}`,
          )
        },
        async persistPage(input) {
          calls.push(`persist:${input.ultNsu}:${input.items.length}`)
          return { acceptedCount: 1, duplicatedCount: 0, skippedCount: 0 }
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).resolves.toEqual({
      duplicatedCount: 0,
      fetchedCount: 1,
      persistedCount: 1,
      status: 'rate-limited',
      ultNsu: '000000000000001',
    })

    expect(calls).toContain('cursor:000000000000001:000000000000090:blocked')
    expect(calls).toContain('finalize:completed:1:1:0')
  })

  test('still fails a SEFAZ rejection that is not the rate limit, keeping the retry rail', async () => {
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-08-10T15:00:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            consultarDFe() {
              return Promise.reject(
                new FiscalRejectionError('108', 'Servico Paralisado', '<retDistDFeInt/>'),
              )
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
          throw new Error('A failed pull must not finalize the import')
        },
        async persistPage() {
          throw new Error('A failed pull must not persist documents')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).rejects.toThrow()

    expect(calls).not.toContain('cursor:000000000000000:000000000000000:blocked')
  })

  test('logs the SEFAZ distribution page response for observability', async () => {
    const events: LoggedEvent[] = []
    const calls: string[] = []
    const cursorRepository = createCursorRepository(calls)
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:20:00.000Z') },
      cursorRepository,
      gatewayFactory: {
        create() {
          return {
            async consultarDFe() {
              return {
                itens: [],
                maxNSU: '000000000000000',
                temMais: false,
                ultNSU: '000000000000000',
              }
            },
          }
        },
      },
      leaseMs: 30_000,
      logger: createSpyLogger(events),
      profile: {
        async loadConfig() {
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async finalizeImport() {},
        async persistPage() {
          throw new Error('An empty page must not persist documents')
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    const pageEvent = events.find(
      (event) => event.message === 'nfe_distribution_sefaz_page_received',
    )
    expect(pageEvent).toBeDefined()
    expect(pageEvent?.metadata).toEqual({
      companyId: DISTRIBUTION_ENVELOPE.companyId,
      environment: 'homologation',
      fetched: 0,
      importId: DISTRIBUTION_ENVELOPE.payload.importId,
      maxNsu: '000000000000000',
      temMais: false,
      ultNsu: '000000000000000',
    })
  })
})

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
      calls.push(`lease:${input.companyId}:${input.environment}:${input.owner}`)
      if (
        cursor.leaseOwner !== null &&
        cursor.leaseExpiresAt !== null &&
        cursor.leaseExpiresAt.getTime() > input.now.getTime()
      ) {
        return null
      }
      cursor = {
        ...cursor,
        environment: input.environment,
        leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
        leaseOwner: input.owner,
      }
      return cursor
    },
    async releaseLease(input) {
      calls.push(`release:${input.companyId}:${input.environment}:${input.owner}`)
      cursor = {
        ...cursor,
        leaseExpiresAt: null,
        leaseOwner: null,
      }
    },
    async resyncCursor(input) {
      calls.push(`resync:${input.skippedFromNsu}-${input.skippedToNsu}`)
      cursor = { ...cursor, consecutiveRateLimits: 0, ultNsu: input.ultNsu }
    },
    async saveCursor(input) {
      calls.push(
        `cursor:${input.ultNsu}:${input.maxNsu}:${input.nextAllowedAt === null ? 'open' : 'blocked'}`,
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
