/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import { nfeParticipants } from '../../src/database/nfe.schema.js'
import {
  createStatusHarness,
  DATABASE_URL,
  documentXml,
  eventXml,
  newAccessKey,
  readChanges,
  readDocument,
  readEvents,
  TRAILS,
} from './nfe-document-status.fixture.js'

const describeDatabase = DATABASE_URL ? describe : describe.skip

describeDatabase('NF-e event before the note, and replays (spec 149 H2, H3)', () => {
  const harness = createStatusHarness('spec149-insert')
  const { db } = harness

  beforeAll(harness.setup)
  afterAll(harness.cleanup)

  for (const trail of TRAILS) {
    const source = trail === 'import' ? ('upload' as const) : ('distribution' as const)

    it(`H2 ${trail}: the note is born cancelled when a registered cancellation came first`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const eventImport = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source,
      })
      await harness.write({
        companyId,
        importId: eventImport,
        trail,
        xml: eventXml({
          accessKey,
          protocol: '135260000000090',
          sequence: '1',
          statusCode: '135',
          type: '110111',
        }),
      })
      await harness.write({
        companyId,
        importId: eventImport,
        trail,
        xml: eventXml({
          accessKey,
          protocol: '135260000000091',
          sequence: '1',
          statusCode: '135',
          type: '110112',
        }),
      })

      const events = await readEvents({ accessKey, companyId, db })
      expect(
        events.map((event) => [event.documentStatusBefore, event.documentStatusAfter]),
      ).toEqual([
        [null, null],
        [null, null],
      ])

      const documentImport = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source,
      })
      await harness.write({
        companyId,
        importId: documentImport,
        trail,
        xml: documentXml({ accessKey }),
      })

      const document = await readDocument({ accessKey, companyId, db })
      expect(document?.status).toBe('cancelled')
      const participants = await db
        .select()
        .from(nfeParticipants)
        .where(eq(nfeParticipants.documentId, document!.id))
      expect(participants).toHaveLength(2)

      const changes = await readChanges({ companyId, db, documentId: document!.id })
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        cause: 'document_insert',
        eventId: events[0]!.id,
        importId: documentImport,
        statusAfter: 'cancelled',
        statusBefore: 'authorized',
      })
      expect(changes[0]!.changedMicros).toBe(document!.createdMicros)

      const untouched = await readEvents({ accessKey, companyId, db })
      expect(
        untouched.map((event) => [event.documentStatusBefore, event.documentStatusAfter]),
      ).toEqual([
        [null, null],
        [null, null],
      ])
    })

    it(`H3 ${trail}: replays and a second cancellation leave one change and the original snapshot`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const firstImport = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source,
      })
      await harness.write({
        companyId,
        importId: firstImport,
        trail,
        xml: documentXml({ accessKey }),
      })
      const cancellation = eventXml({
        accessKey,
        protocol: '135260000000092',
        sequence: '1',
        statusCode: '135',
        type: '110111',
      })
      await harness.write({ companyId, importId: firstImport, trail, xml: cancellation })
      const cancelled = await readDocument({ accessKey, companyId, db })
      const [original] = await readEvents({ accessKey, companyId, db })

      const replayImport = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source,
      })
      await harness.write({ companyId, importId: replayImport, trail, xml: cancellation })
      await harness.write({
        companyId,
        importId: replayImport,
        trail,
        xml: eventXml({
          accessKey,
          protocol: '135260000000093',
          sequence: '2',
          statusCode: '135',
          type: '110111',
        }),
      })
      await harness.write({
        companyId,
        importId: replayImport,
        trail,
        xml: documentXml({ accessKey }),
      })

      const after = await readDocument({ accessKey, companyId, db })
      expect(after?.status).toBe('cancelled')
      expect(after?.updatedMicros).toBe(cancelled!.updatedMicros)
      expect(await readChanges({ companyId, db, documentId: after!.id })).toHaveLength(1)

      const events = await readEvents({ accessKey, companyId, db })
      expect(events).toHaveLength(2)
      expect(events[0]).toEqual(original!)
      expect(events[1]).toMatchObject({
        documentStatusAfter: 'cancelled',
        documentStatusBefore: 'cancelled',
        eventSequence: 2n,
        importId: replayImport,
      })

      expect(
        await harness.connect().imports.findExistingDocument({ accessKey, companyId }),
      ).toEqual({
        documentId: after!.id,
      })
    })

    it(`H3 ${trail}: an event stored before this spec cancels the note when it arrives again`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const legacyEventId = await harness.insertLegacyEvent({
        accessKey,
        companyId,
        type: '110111',
      })
      const importId = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source,
      })
      await harness.write({ companyId, importId, trail, xml: documentXml({ accessKey }) })
      expect((await readDocument({ accessKey, companyId, db }))?.status).toBe('authorized')
      const [legacyBefore] = await readEvents({ accessKey, companyId, db })

      await harness.write({
        companyId,
        importId,
        trail,
        xml: eventXml({
          accessKey,
          protocol: '135260000000094',
          sequence: '1',
          statusCode: '135',
          type: '110111',
        }),
      })

      const document = await readDocument({ accessKey, companyId, db })
      expect(document?.status).toBe('cancelled')
      const changes = await readChanges({ companyId, db, documentId: document!.id })
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({ cause: 'event', eventId: legacyEventId, importId })

      const [legacyAfter] = await readEvents({ accessKey, companyId, db })
      expect(legacyAfter).toEqual(legacyBefore!)
      expect(legacyAfter).toMatchObject({
        documentStatusAfter: null,
        origin: null,
        statusCode: null,
      })
    })
  }
})
