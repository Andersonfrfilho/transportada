/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FiscalRejectionError } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import type { WorkerLogger } from '../../src/shared/worker.types.js'

import {
  DISTRIBUTION_CONFIG,
  DISTRIBUTION_ENVELOPE,
  type DistributionCursorRecord,
  type NfeDistributionCursorRepositoryPort,
  createDistributionItem,
  createNfeDistributionConsumerFixture,
} from './nfe-distribution.fixture.js'

type LoggedEvent = {
  readonly level: 'error' | 'info' | 'warn'
  readonly message: string
  readonly metadata: Record<string, unknown> | undefined
}

const COMPANY_ID = DISTRIBUTION_ENVELOPE.companyId
const IMPORT_ID = DISTRIBUTION_ENVELOPE.payload.importId
const EMPTY_NSU = '000000000000000'

function createSpyLogger(events: LoggedEvent[]): WorkerLogger {
  return {
    error(message, metadata) {
      events.push({ level: 'error', message, metadata })
    },
    info(message, metadata) {
      events.push({ level: 'info', message, metadata })
    },
    warn(message, metadata) {
      events.push({ level: 'warn', message, metadata })
    },
  }
}

function findEvent(events: LoggedEvent[], message: string): LoggedEvent | undefined {
  return events.find((event) => event.message === message)
}

describe('NF-e distribution observability contract', () => {
  test('logs the whole pull lifecycle, always naming the fiscal environment', async () => {
    const events: LoggedEvent[] = []
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:30:00.000Z') },
      cursorRepository: createCursorRepository([]),
      gatewayFactory: {
        create() {
          return {
            async consultarDFe(input) {
              if (input.ultNSU === EMPTY_NSU) {
                return {
                  itens: [
                    createDistributionItem({
                      accessKey: '35190730290856000160550010000000011000000059',
                      nsu: '000000000000001',
                    }),
                  ],
                  maxNSU: '000000000000001',
                  temMais: false,
                  ultNSU: '000000000000001',
                }
              }

              throw new Error('An exhausted page must not be consulted again')
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
        async finalizeImport() {
          /* empty */
        },
        async persistPage() {
          return { acceptedCount: 1, duplicatedCount: 0, skippedCount: 0 }
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(findEvent(events, 'nfe_distribution_pull_started')).toEqual({
      level: 'info',
      message: 'nfe_distribution_pull_started',
      metadata: {
        companyId: COMPANY_ID,
        environment: 'homologation',
        importId: IMPORT_ID,
        ultNsu: EMPTY_NSU,
      },
    })

    expect(findEvent(events, 'nfe_distribution_sefaz_page_received')?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      fetched: 1,
      importId: IMPORT_ID,
      maxNsu: '000000000000001',
      temMais: false,
      ultNsu: '000000000000001',
    })

    expect(findEvent(events, 'nfe_distribution_page_persisted')?.metadata).toEqual({
      accepted: 1,
      companyId: COMPANY_ID,
      duplicated: 0,
      environment: 'homologation',
      importId: IMPORT_ID,
      skipped: 0,
      ultNsu: '000000000000001',
    })

    expect(findEvent(events, 'nfe_distribution_pull_finished')?.metadata).toEqual({
      companyId: COMPANY_ID,
      duplicated: 0,
      environment: 'homologation',
      fetched: 1,
      importId: IMPORT_ID,
      persisted: 1,
      skipped: 0,
      status: 'completed',
      ultNsu: '000000000000001',
    })
  })

  // Sem o cStat no log, puxada vazia por falta de nota e puxada barrada pela SEFAZ ficam idênticas
  test('logs the SEFAZ rejection code and message without leaking the raw response', async () => {
    const events: LoggedEvent[] = []
    const rawResponse = '<retDistDFeInt><xMotivo>Consumo Indevido</xMotivo></retDistDFeInt>'
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:40:00.000Z') },
      cursorRepository: createCursorRepository([]),
      gatewayFactory: {
        create() {
          return {
            consultarDFe() {
              return Promise.reject(
                new FiscalRejectionError('108', 'Rejeicao: Servico Paralisado', rawResponse),
              )
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
        async finalizeImport() {
          throw new Error('A failed pull must not finalize the import')
        },
        async persistPage() {
          throw new Error('A failed pull must not persist documents')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).rejects.toThrow()

    const failure = findEvent(events, 'nfe_distribution_pull_failed')
    expect(failure?.level).toBe('error')
    expect(failure?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      errorCode: '108',
      errorName: 'FiscalRejectionError',
      importId: IMPORT_ID,
      providerMessage: 'Rejeicao: Servico Paralisado',
      ultNsu: EMPTY_NSU,
    })
    expect(JSON.stringify(events)).not.toContain('retDistDFeInt')
  })

  // O 656 não é falha: sai como aviso com o cStat visível, seguido da janela que ele acabou de abrir
  test('logs the SEFAZ rate limit as the window it opens, not as a failed pull', async () => {
    const events: LoggedEvent[] = []
    const rawResponse = '<retDistDFeInt><xMotivo>Consumo Indevido</xMotivo></retDistDFeInt>'
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-08-10T15:00:00.000Z') },
      cursorRepository: createCursorRepository([]),
      gatewayFactory: {
        create() {
          return {
            consultarDFe() {
              return Promise.reject(
                new FiscalRejectionError('656', 'Rejeicao: Consumo Indevido', rawResponse),
              )
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
        async finalizeImport() {
          /* empty */
        },
        async persistPage() {
          throw new Error('A refused pull must not persist documents')
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    const rateLimited = findEvent(events, 'nfe_distribution_rate_limited_by_sefaz')
    expect(rateLimited?.level).toBe('warn')
    expect(rateLimited?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      errorCode: '656',
      errorName: 'FiscalRejectionError',
      importId: IMPORT_ID,
      providerMessage: 'Rejeicao: Consumo Indevido',
      ultNsu: EMPTY_NSU,
    })

    expect(findEvent(events, 'nfe_distribution_rate_limit_window_applied')?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      importId: IMPORT_ID,
      maxNsu: EMPTY_NSU,
      nextAllowedAt: '2026-08-10T16:00:00.000Z',
      ultNsu: EMPTY_NSU,
    })
    expect(findEvent(events, 'nfe_distribution_pull_failed')).toBeUndefined()
    expect(JSON.stringify(events)).not.toContain('retDistDFeInt')
  })

  test('logs the anti-656 window it just applied when the page comes back empty', async () => {
    const events: LoggedEvent[] = []
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:50:00.000Z') },
      cursorRepository: createCursorRepository([]),
      gatewayFactory: {
        create() {
          return {
            async consultarDFe() {
              return { itens: [], maxNSU: EMPTY_NSU, temMais: false, ultNSU: EMPTY_NSU }
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
        async finalizeImport() {
          /* empty */
        },
        async persistPage() {
          throw new Error('An empty page must not persist documents')
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    expect(findEvent(events, 'nfe_distribution_rate_limit_window_applied')?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      importId: IMPORT_ID,
      maxNsu: EMPTY_NSU,
      nextAllowedAt: '2026-07-23T00:50:00.000Z',
      ultNsu: EMPTY_NSU,
    })
  })

  test('logs the pull it skipped while the cooldown window is still open', async () => {
    const events: LoggedEvent[] = []
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:00:00.000Z') },
      cursorRepository: createCursorRepository([], {
        nextAllowedAt: new Date('2026-07-22T23:45:00.000Z'),
        ultNsu: '000000000000120',
      }),
      gatewayFactory: {
        create() {
          return {
            consultarDFe() {
              throw new Error('The cooldown window must not reach the SEFAZ')
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
        async finalizeImport() {
          /* empty */
        },
        async persistPage() {
          throw new Error('A skipped pull must not persist documents')
        },
      },
    })

    await consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })

    const skipped = findEvent(events, 'nfe_distribution_pull_skipped_cooldown')
    expect(skipped?.level).toBe('warn')
    expect(skipped?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      importId: IMPORT_ID,
      nextAllowedAt: '2026-07-22T23:45:00.000Z',
      ultNsu: '000000000000120',
    })
    expect(findEvent(events, 'nfe_distribution_sefaz_page_received')).toBeUndefined()
  })

  test('logs the lease it could not take from another worker', async () => {
    const events: LoggedEvent[] = []
    const consumer = await createNfeDistributionConsumerFixture({
      clock: { now: () => new Date('2026-07-22T23:00:00.000Z') },
      cursorRepository: {
        async acquireLease() {
          return null
        },
        async releaseLease() {
          /* empty */
        },
        async saveCursor() {
          /* empty */
        },
      },
      gatewayFactory: {
        create() {
          return {
            consultarDFe() {
              throw new Error('A lost lease must not reach the SEFAZ')
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
        async finalizeImport() {
          /* empty */
        },
        async persistPage() {
          throw new Error('A lost lease must not persist documents')
        },
      },
    })

    await expect(consumer.execute({ envelope: DISTRIBUTION_ENVELOPE })).rejects.toThrow()

    const unavailable = findEvent(events, 'nfe_distribution_lease_unavailable')
    expect(unavailable?.level).toBe('warn')
    expect(unavailable?.metadata).toEqual({
      companyId: COMPANY_ID,
      environment: 'homologation',
      importId: IMPORT_ID,
    })
  })
})

function createCursorRepository(
  calls: string[],
  initialOverride?: Partial<DistributionCursorRecord>,
): NfeDistributionCursorRepositoryPort {
  let cursor: DistributionCursorRecord = {
    companyId: COMPANY_ID,
    environment: 'homologation',
    leaseExpiresAt: null,
    leaseOwner: null,
    maxNsu: EMPTY_NSU,
    nextAllowedAt: null,
    ultNsu: EMPTY_NSU,
    version: 1n,
    ...initialOverride,
  }

  return {
    async acquireLease(input) {
      calls.push(`lease:${input.owner}`)
      cursor = {
        ...cursor,
        environment: input.environment,
        leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
        leaseOwner: input.owner,
      }
      return cursor
    },
    async releaseLease(input) {
      calls.push(`release:${input.owner}`)
      cursor = { ...cursor, leaseExpiresAt: null, leaseOwner: null }
    },
    async saveCursor(input) {
      calls.push(`cursor:${input.ultNsu}:${input.maxNsu}`)
      cursor = {
        ...cursor,
        maxNsu: input.maxNsu,
        nextAllowedAt: input.nextAllowedAt,
        ultNsu: input.ultNsu,
        version: cursor.version + 1n,
      }
    },
  }
}
