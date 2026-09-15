/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-documents/domain/system-distribution-actor.constant.js'
import {
  createStatusHarness,
  DATABASE_URL,
  documentXml,
  eventXml,
  lockKey,
  newAccessKey,
  readChanges,
  readDocument,
} from './nfe-document-status.fixture.js'

const describeDatabase = DATABASE_URL ? describe : describe.skip

describeDatabase('NF-e status across tenants and from the summary (spec 149 H5, H6)', () => {
  const harness = createStatusHarness('spec149-summary')
  const { db } = harness
  const control = DATABASE_URL
    ? createDrizzleProvider({ connection: { max: 1, url: DATABASE_URL } })
    : undefined

  beforeAll(harness.setup)
  afterAll(async () => {
    await control?.close()
    await harness.cleanup()
  })

  async function importFor(companyId: string, requestedByUserId = harness.userId): Promise<string> {
    return harness.createImport({ companyId, requestedByUserId, source: 'distribution' })
  }

  it('H5: a cancellation in company A never touches the same key in company B', async () => {
    const accessKey = newAccessKey()
    const importA = await importFor(harness.companyA)
    const importB = await importFor(harness.companyB)
    await harness.write({
      companyId: harness.companyA,
      importId: importA,
      trail: 'import',
      xml: documentXml({ accessKey }),
    })
    await harness.write({
      companyId: harness.companyB,
      importId: importB,
      trail: 'distribution',
      xml: documentXml({ accessKey }),
    })
    const beforeB = await readDocument({ accessKey, companyId: harness.companyB, db })

    await harness.write({
      companyId: harness.companyA,
      importId: importA,
      trail: 'distribution',
      xml: eventXml({
        accessKey,
        protocol: '135260000000095',
        sequence: '1',
        statusCode: '135',
        type: '110111',
      }),
    })

    expect((await readDocument({ accessKey, companyId: harness.companyA, db }))?.status).toBe(
      'cancelled',
    )
    const afterB = await readDocument({ accessKey, companyId: harness.companyB, db })
    expect(afterB?.status).toBe('authorized')
    expect(afterB?.updatedMicros).toBe(beforeB!.updatedMicros)
    expect(
      await readChanges({ companyId: harness.companyB, db, documentId: afterB!.id }),
    ).toHaveLength(0)
  })

  it('H5: holding (A, K) blocks neither (B, K) nor (A, K2)', async () => {
    const accessKey = newAccessKey()
    const otherKey = newAccessKey()
    const importA = await importFor(harness.companyA)
    const importB = await importFor(harness.companyB)
    await control!.db.execute(
      sql`select pg_advisory_lock(hashtextextended(${lockKey({ accessKey, companyId: harness.companyA })}, 0))`,
    )
    try {
      const started = Date.now()
      await Promise.race([
        Promise.all([
          harness.write({
            companyId: harness.companyB,
            importId: importB,
            trail: 'import',
            xml: documentXml({ accessKey }),
          }),
          harness.write({
            companyId: harness.companyA,
            importId: importA,
            trail: 'distribution',
            xml: documentXml({ accessKey: otherKey }),
          }),
        ]),
        Bun.sleep(2000).then(() => {
          throw new Error('LOCK_SERIALIZED_ACROSS_KEYS')
        }),
      ])
      expect(Date.now() - started).toBeLessThan(2000)
    } finally {
      await control!.db.execute(
        sql`select pg_advisory_unlock(hashtextextended(${lockKey({ accessKey, companyId: harness.companyA })}, 0))`,
      )
    }
    expect(await readDocument({ accessKey, companyId: harness.companyB, db })).toBeDefined()
    expect(
      await readDocument({ accessKey: otherKey, companyId: harness.companyA, db }),
    ).toBeDefined()
  })

  it('H6: an unsigned note is denied by a summary with situation 3', async () => {
    const companyId = harness.companyA
    const accessKey = newAccessKey()
    const importId = await importFor(companyId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID)
    await harness.write({
      companyId,
      importId,
      trail: 'distribution',
      xml: documentXml({ accessKey, status: 'unsigned' }),
    })

    await harness.writeSummary({ accessKey, companyId, importId, situation: '3' })

    const document = await readDocument({ accessKey, companyId, db })
    expect(document?.status).toBe('denied')
    const changes = await readChanges({ companyId, db, documentId: document!.id })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      actorUserId: null,
      cause: 'summary',
      eventId: null,
      importId,
      origin: 'automatic',
      requestedByUserId: null,
      statusAfter: 'denied',
      statusBefore: 'unsigned',
    })
    expect(changes[0]!.changedMicros).toBe(document!.updatedMicros)
  })

  it('H6: an authorized note is never denied by the summary, and the inconsistency is warned', async () => {
    const companyId = harness.companyA
    const accessKey = newAccessKey()
    const importId = await importFor(companyId)
    await harness.write({
      companyId,
      importId,
      trail: 'distribution',
      xml: documentXml({ accessKey }),
    })
    const before = await readDocument({ accessKey, companyId, db })

    await harness.writeSummary({ accessKey, companyId, importId, situation: '3' })

    const after = await readDocument({ accessKey, companyId, db })
    expect(after?.status).toBe('authorized')
    expect(after?.updatedMicros).toBe(before!.updatedMicros)
    expect(harness.logs).toContainEqual({
      level: 'warn',
      message: 'nfe_summary_status_inconsistent',
      metadata: { companyId, documentId: after!.id, situation: '3' },
    })
  })

  it('H6: an authorized note is cancelled by a summary with situation 2', async () => {
    const companyId = harness.companyA
    const accessKey = newAccessKey()
    const importId = await importFor(companyId)
    await harness.write({
      companyId,
      importId,
      trail: 'distribution',
      xml: documentXml({ accessKey }),
    })

    await harness.writeSummary({ accessKey, companyId, importId, situation: '2' })

    const document = await readDocument({ accessKey, companyId, db })
    expect(document?.status).toBe('cancelled')
    const changes = await readChanges({ companyId, db, documentId: document!.id })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      cause: 'summary',
      eventId: null,
      origin: 'automatic',
      requestedByUserId: harness.userId,
      statusBefore: 'authorized',
    })
  })

  it('H6: a summary of an unknown key changes nothing', async () => {
    const companyId = harness.companyA
    const accessKey = newAccessKey()
    const importId = await importFor(companyId)
    const logsBefore = harness.logs.length

    await harness.writeSummary({ accessKey, companyId, importId, situation: '2' })

    expect(await readDocument({ accessKey, companyId, db })).toBeUndefined()
    expect(harness.logs.slice(logsBefore)).toEqual([])
  })

  it('never logs an access key', () => {
    const serialized = JSON.stringify(harness.logs)
    for (const accessKey of harness.accessKeys) {
      expect(serialized).not.toContain(accessKey)
    }
  })
})
