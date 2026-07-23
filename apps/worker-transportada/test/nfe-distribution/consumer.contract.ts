/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_CONFIG,
  DISTRIBUTION_ENVELOPE,
  type DistributionCursorRecord,
  type NfeDistributionCursorRepositoryPort,
  createDistributionItem,
  createNfeDistributionConsumerFixture,
} from './nfe-distribution.fixture.js'

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
      profile: {
        async loadConfig(input) {
          calls.push(`profile:${input.companyId}`)
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
        async persistPage(input) {
          calls.push(`persist:${input.ultNsu}:${input.items.length}`)
          const acceptedItems =
            input.ultNsu === '000000000000050'
              ? input.items
              : input.items.filter((item) => item.nsu !== '000000000000050')
          return {
            acceptedItems,
            duplicatedCount: input.items.length - acceptedItems.length,
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
      profile: {
        async loadConfig() {
          return DISTRIBUTION_CONFIG
        },
      },
      repository: {
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
  })
})

function createCursorRepository(calls: string[]): NfeDistributionCursorRepositoryPort {
  let cursor: DistributionCursorRecord = {
    companyId: DISTRIBUTION_ENVELOPE.companyId,
    environment: 'homologation',
    leaseExpiresAt: null,
    leaseOwner: null,
    maxNsu: '000000000000000',
    nextAllowedAt: null,
    ultNsu: '000000000000000',
    version: 1n,
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
    async saveCursor(input) {
      calls.push(
        `cursor:${input.ultNsu}:${input.maxNsu}:${input.nextAllowedAt === null ? 'open' : 'blocked'}`,
      )
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
