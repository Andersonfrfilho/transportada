/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import {
  countWaitingAdvisoryLocks,
  createStatusHarness,
  DATABASE_URL,
  documentXml,
  eventXml,
  lockKey,
  newAccessKey,
  readChanges,
  readDocument,
  type Trail,
  waitUntil,
} from './nfe-document-status.fixture.js'

const describeDatabase = DATABASE_URL ? describe : describe.skip

type Write = 'document' | 'event'

const ORDERS: readonly {
  readonly expectedCause: 'document_insert' | 'event'
  readonly first: { readonly trail: Trail; readonly write: Write }
  readonly second: { readonly trail: Trail; readonly write: Write }
}[] = [
  {
    expectedCause: 'event',
    first: { trail: 'import', write: 'document' },
    second: { trail: 'distribution', write: 'event' },
  },
  {
    expectedCause: 'document_insert',
    first: { trail: 'import', write: 'event' },
    second: { trail: 'distribution', write: 'document' },
  },
]

describeDatabase('NF-e note and cancellation racing for the same key (spec 149 H7)', () => {
  const harness = createStatusHarness('spec149-race')
  const { db } = harness
  const control = DATABASE_URL
    ? createDrizzleProvider({ connection: { max: 1, url: DATABASE_URL } })
    : undefined

  beforeAll(harness.setup)
  afterAll(async () => {
    await control?.close()
    await harness.cleanup()
  })

  function xmlFor(write: Write, accessKey: string) {
    return write === 'document'
      ? documentXml({ accessKey })
      : eventXml({
          accessKey,
          protocol: '135260000000096',
          sequence: '1',
          statusCode: '135',
          type: '110111',
        })
  }

  async function expectSingleCancellation(params: {
    readonly accessKey: string
    readonly expectedCause?: 'document_insert' | 'event'
  }): Promise<void> {
    const companyId = harness.companyA
    const document = await readDocument({ accessKey: params.accessKey, companyId, db })
    expect(document?.status).toBe('cancelled')
    expect(document!.updatedMicros >= document!.createdMicros).toBe(true)
    const changes = await readChanges({ companyId, db, documentId: document!.id })
    expect(changes).toHaveLength(1)
    if (params.expectedCause !== undefined) {
      expect(changes[0]?.cause).toBe(params.expectedCause)
    }
  }

  for (const order of ORDERS) {
    it(`${order.first.write} waits first, ${order.second.write} second → one ${order.expectedCause} change`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const importId = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source: 'upload',
      })
      const writerOne = harness.connect()
      const writerTwo = harness.connect()
      const key = lockKey({ accessKey, companyId })

      await control!.db.execute(sql`select pg_advisory_lock(hashtextextended(${key}, 0))`)
      let first: Promise<void> | undefined
      let second: Promise<void> | undefined
      try {
        first = harness.write({
          companyId,
          importId,
          trail: order.first.trail,
          writers: writerOne,
          xml: xmlFor(order.first.write, accessKey),
        })
        await waitUntil({
          check: async () => (await countWaitingAdvisoryLocks(db)) === 1,
          timeoutMs: 5000,
        })
        second = harness.write({
          companyId,
          importId,
          trail: order.second.trail,
          writers: writerTwo,
          xml: xmlFor(order.second.write, accessKey),
        })
        await waitUntil({
          check: async () => (await countWaitingAdvisoryLocks(db)) === 2,
          timeoutMs: 5000,
        })
      } finally {
        await control!.db.execute(sql`select pg_advisory_unlock(hashtextextended(${key}, 0))`)
      }
      await Promise.all([first, second])

      await expectSingleCancellation({ accessKey, expectedCause: order.expectedCause })
    })
  }

  it('note and cancellation in Promise.all, twenty fresh keys, always end with one cancellation', async () => {
    const companyId = harness.companyA
    const importId = await harness.createImport({
      companyId,
      requestedByUserId: harness.userId,
      source: 'upload',
    })
    const writerOne = harness.connect()
    const writerTwo = harness.connect()

    for (let round = 0; round < 20; round += 1) {
      const accessKey = newAccessKey()
      const trails: readonly Trail[] =
        round % 2 === 0 ? ['import', 'distribution'] : ['distribution', 'import']
      await Promise.all([
        harness.write({
          companyId,
          importId,
          trail: trails[0]!,
          writers: writerOne,
          xml: xmlFor('document', accessKey),
        }),
        harness.write({
          companyId,
          importId,
          trail: trails[1]!,
          writers: writerTwo,
          xml: xmlFor('event', accessKey),
        }),
      ])
      await expectSingleCancellation({ accessKey })
    }
  })
})
