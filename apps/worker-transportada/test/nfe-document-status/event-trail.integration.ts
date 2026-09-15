/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-documents/domain/system-distribution-actor.constant.js'
import {
  createStatusHarness,
  DATABASE_URL,
  documentXml,
  eventXml,
  newAccessKey,
  readChanges,
  readDocument,
  readEvents,
  type Trail,
} from './nfe-document-status.fixture.js'

const describeDatabase = DATABASE_URL ? describe : describe.skip

type OriginCase = {
  readonly expected: {
    readonly actor: 'user' | null
    readonly origin: 'automatic' | 'manual'
    readonly requester: 'user' | null
  }
  readonly name: string
  readonly requester: 'system' | 'user'
  readonly source: 'distribution' | 'upload'
  readonly trail: Trail
}

const ORIGIN_CASES: readonly OriginCase[] = [
  {
    expected: { actor: 'user', origin: 'manual', requester: null },
    name: 'upload (import trail)',
    requester: 'user',
    source: 'upload',
    trail: 'import',
  },
  {
    expected: { actor: null, origin: 'automatic', requester: null },
    name: 'scheduled distribution',
    requester: 'system',
    source: 'distribution',
    trail: 'distribution',
  },
  {
    expected: { actor: null, origin: 'automatic', requester: 'user' },
    name: '"fetch now" distribution',
    requester: 'user',
    source: 'distribution',
    trail: 'distribution',
  },
]

describeDatabase('NF-e event changes the note status (spec 149 H1, H4)', () => {
  const harness = createStatusHarness('spec149-event')
  const { db } = harness

  beforeAll(harness.setup)
  afterAll(harness.cleanup)

  for (const scenario of ORIGIN_CASES) {
    it(`H1 ${scenario.name}: a registered cancellation cancels an authorized note`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const requestedByUserId =
        scenario.requester === 'system' ? SYSTEM_DISTRIBUTION_ACTOR_USER_ID : harness.userId
      const importId = await harness.createImport({
        companyId,
        requestedByUserId,
        source: scenario.source,
      })
      await harness.write({
        companyId,
        importId,
        trail: scenario.trail,
        xml: documentXml({ accessKey }),
      })
      const before = await readDocument({ accessKey, companyId, db })

      await harness.write({
        companyId,
        importId,
        trail: scenario.trail,
        xml: eventXml({
          accessKey,
          protocol: '135260000000077',
          sequence: '1',
          statusCode: '135',
          type: '110111',
        }),
      })

      const after = await readDocument({ accessKey, companyId, db })
      expect(after?.status).toBe('cancelled')
      expect(after!.updatedMicros > before!.updatedMicros).toBe(true)

      const [event] = await readEvents({ accessKey, companyId, db })
      const actor = scenario.expected.actor === 'user' ? harness.userId : null
      const requester = scenario.expected.requester === 'user' ? harness.userId : null
      expect(event).toMatchObject({
        actorUserId: actor,
        documentStatusAfter: 'cancelled',
        documentStatusBefore: 'authorized',
        importId,
        origin: scenario.expected.origin,
        protocol: '135260000000077',
        requestedByUserId: requester,
        statusCode: '135',
      })

      const changes = await readChanges({ companyId, db, documentId: after!.id })
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        actorUserId: actor,
        cause: 'event',
        eventId: event!.id,
        importId,
        origin: scenario.expected.origin,
        requestedByUserId: requester,
        statusAfter: 'cancelled',
        statusBefore: 'authorized',
      })
      expect(changes[0]!.changedMicros).toBe(after!.updatedMicros)

      expect(harness.logs).toContainEqual({
        level: 'info',
        message: 'nfe_document_status_changed',
        metadata: {
          cause: 'event',
          companyId,
          documentId: after!.id,
          from: 'authorized',
          to: 'cancelled',
        },
      })
    })
  }

  for (const trail of ['import', 'distribution'] as const) {
    it(`H4 ${trail}: CC-e, manifestation and unregistered events never touch the note`, async () => {
      const companyId = harness.companyA
      const accessKey = newAccessKey()
      const importId = await harness.createImport({
        companyId,
        requestedByUserId: harness.userId,
        source: trail === 'import' ? 'upload' : 'distribution',
      })
      await harness.write({ companyId, importId, trail, xml: documentXml({ accessKey }) })
      const before = await readDocument({ accessKey, companyId, db })
      const warningsBefore = harness.logs.filter((entry) => entry.level === 'warn').length

      const events = [
        eventXml({
          accessKey,
          protocol: '135260000000078',
          sequence: '1',
          statusCode: '135',
          type: '110110',
        }),
        eventXml({
          accessKey,
          protocol: '135260000000079',
          sequence: '1',
          statusCode: '135',
          type: '210200',
        }),
        eventXml({
          accessKey,
          protocol: '135260000000080',
          sequence: '1',
          statusCode: '573',
          type: '110111',
        }),
        eventXml({ accessKey, sequence: '2', type: '110111' }),
        eventXml({
          accessKey,
          protocol: '135260000000081',
          sequence: '3',
          statusCode: '1350',
          type: '110111',
        }),
      ]
      for (const xml of events) {
        await harness.write({ companyId, importId, trail, xml })
      }

      const after = await readDocument({ accessKey, companyId, db })
      expect(after?.status).toBe('authorized')
      expect(after?.updatedMicros).toBe(before!.updatedMicros)
      expect(await readChanges({ companyId, db, documentId: after!.id })).toHaveLength(0)

      const stored = await readEvents({ accessKey, companyId, db })
      const byKey = new Map(
        stored.map((event) => [`${event.eventType}:${event.eventSequence}`, event]),
      )
      expect(byKey.get('110111:1')).toMatchObject({
        protocol: '135260000000080',
        statusCode: '573',
      })
      expect(byKey.get('110111:2')).toMatchObject({ protocol: null, statusCode: null })
      expect(byKey.get('110111:3')).toMatchObject({ protocol: null, statusCode: null })
      for (const event of stored) {
        expect(event.documentStatusBefore).toBe('authorized')
        expect(event.documentStatusAfter).toBe('authorized')
      }

      const warnings = harness.logs.filter((entry) => entry.level === 'warn').slice(warningsBefore)
      expect(
        warnings.map((entry) => [
          entry.message,
          entry.metadata['eventType'],
          entry.metadata['reason'],
        ]),
      ).toEqual([
        ['nfe_event_status_not_applied', '110111', 'status-code-not-registered'],
        ['nfe_event_status_not_applied', '110111', 'missing-status-code'],
        ['nfe_event_status_not_applied', '110111', 'missing-status-code'],
      ])
      expect(warnings[0]?.metadata).toEqual({
        companyId,
        eventId: byKey.get('110111:1')!.id,
        eventType: '110111',
        reason: 'status-code-not-registered',
      })
    })
  }

  it('never logs an access key', () => {
    const serialized = JSON.stringify(harness.logs)
    for (const accessKey of harness.accessKeys) {
      expect(serialized).not.toContain(accessKey)
    }
  })
})
