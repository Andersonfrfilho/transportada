/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import type {
  NfeRecipientEmailBackfillRepository,
  NfeRecipientEmailPendingDocument,
} from '../../src/nfe-recipient-email-backfill/application/nfe-recipient-email-backfill.port.js'
import { createNfeRecipientEmailBackfillRoutine } from '../../src/nfe-recipient-email-backfill/application/nfe-recipient-email-backfill.routine.js'
import { NFE_RECIPIENT_EMAIL_BACKFILL_JOB } from '../../src/nfe-recipient-email-backfill/domain/nfe-recipient-email-backfill.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VALID_EMAIL = 'compras@cliente.example'
const INVALID_EMAIL = 'nao-e-um-email'

const CONTEXT = {
  correlationId: 'correlation-1',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: NFE_RECIPIENT_EMAIL_BACKFILL_JOB,
  origin: 'manual',
} as const

type XmlByKey = Readonly<Record<string, { readonly email?: string; readonly kind?: 'nfe-event' }>>

function pending(documentId: string): NfeRecipientEmailPendingDocument {
  return { bucket: 'bucket', companyId: COMPANY_ID, documentId, objectKey: documentId }
}

function createFakes(input: {
  readonly documents: readonly string[]
  readonly failingKeys?: readonly string[]
  readonly alreadyFilled?: readonly string[]
  readonly batchSize?: number
  readonly xmlByKey: XmlByKey
}) {
  const writes: { readonly documentId: string; readonly email: string }[] = []
  const logs: unknown[] = []
  const listed: (string | undefined)[] = []
  const repository: NfeRecipientEmailBackfillRepository = {
    async fillRecipientEmail(write) {
      if (input.alreadyFilled?.includes(write.documentId)) return false
      writes.push({ documentId: write.documentId, email: write.email })
      return true
    },
    async listDocumentsWithoutRecipientEmail({ cursor, limit }) {
      listed.push(cursor)
      const start = cursor === undefined ? 0 : input.documents.indexOf(cursor) + 1
      return input.documents
        .slice(start, start + Math.min(limit, input.batchSize ?? limit))
        .map(pending)
    },
  }
  const logger = {
    error: (message: string, metadata: unknown) => logs.push({ message, metadata }),
    info: (message: string, metadata: unknown) => logs.push({ message, metadata }),
    warn: (message: string, metadata: unknown) => logs.push({ message, metadata }),
  }
  const routine = createNfeRecipientEmailBackfillRoutine({
    importer: {
      async importXml({ xml }) {
        const entry = input.xmlByKey[xml]
        if (entry?.kind === 'nfe-event') return { kind: 'nfe-event' } as unknown as ImportedNfeXml
        return {
          document: {
            recipient: { name: 'Destinatario', taxId: '1', email: entry?.email },
          },
          kind: 'authorized-nfe',
        } as unknown as ImportedNfeXml
      },
    },
    logger: logger as never,
    reader: {
      async readXml({ key }) {
        if (input.failingKeys?.includes(key)) throw new Error(`storage down for ${VALID_EMAIL}`)
        return key
      },
    },
    repository,
  })
  return { listed, logs, routine, writes }
}

describe('nfe recipient email backfill routine', () => {
  test('fills the column from the stored xml and counts every outcome', async () => {
    const fakes = createFakes({
      documents: ['a', 'b', 'c', 'd'],
      xmlByKey: {
        a: { email: ` ${VALID_EMAIL} ` },
        b: { email: INVALID_EMAIL },
        c: {},
        d: { kind: 'nfe-event' },
      },
    })

    const result = await fakes.routine.run(CONTEXT)

    expect(fakes.writes).toEqual([{ documentId: 'a', email: VALID_EMAIL }])
    expect(result).toEqual({
      counters: { examined: 4, failed: 0, filled: 1, rejected: 1, withoutEmail: 2 },
      outcome: 'succeeded',
    })
  })

  test('walks every batch by cursor and stops on an empty one', async () => {
    const fakes = createFakes({
      batchSize: 2,
      documents: ['a', 'b', 'c', 'd', 'e'],
      xmlByKey: { a: { email: VALID_EMAIL }, e: { email: VALID_EMAIL } },
    })

    const result = await fakes.routine.run(CONTEXT)

    expect(fakes.listed).toEqual([undefined, 'b', 'd', 'e'])
    expect(result.counters.examined).toBe(5)
    expect(result.counters.filled).toBe(2)
  })

  test('isolates a failing document: the rest of the batch is still processed', async () => {
    const fakes = createFakes({
      documents: ['a', 'b', 'c'],
      failingKeys: ['b'],
      xmlByKey: { a: { email: VALID_EMAIL }, c: { email: VALID_EMAIL } },
    })

    const result = await fakes.routine.run(CONTEXT)

    expect(fakes.writes.map((write) => write.documentId)).toEqual(['a', 'c'])
    expect(result.counters).toEqual({
      examined: 3,
      failed: 1,
      filled: 2,
      rejected: 0,
      withoutEmail: 0,
    })
    expect(result.outcome).toBe('succeeded')
  })

  test('never overwrites: a document filled meanwhile is a no-op write, not an error', async () => {
    const fakes = createFakes({
      alreadyFilled: ['a'],
      documents: ['a'],
      xmlByKey: { a: { email: VALID_EMAIL } },
    })

    const result = await fakes.routine.run(CONTEXT)

    expect(fakes.writes).toEqual([])
    expect(result.counters.failed).toBe(0)
  })

  test('is idempotent: a second pass over the same pending set writes the same thing', async () => {
    const fakes = createFakes({ documents: ['a'], xmlByKey: { a: { email: VALID_EMAIL } } })

    await fakes.routine.run(CONTEXT)
    await fakes.routine.run(CONTEXT)

    expect(fakes.writes).toEqual([
      { documentId: 'a', email: VALID_EMAIL },
      { documentId: 'a', email: VALID_EMAIL },
    ])
  })

  test('stops before the next batch when the stop was requested', async () => {
    const fakes = createFakes({ documents: ['a', 'b'], batchSize: 1, xmlByKey: {} })
    let calls = 0

    const result = await fakes.routine.run({
      ...CONTEXT,
      isStopRequested: () => calls++ >= 1,
    })

    expect(result.counters.examined).toBe(1)
  })

  test('logs only counts: never an address, never the failure message', async () => {
    const fakes = createFakes({
      documents: ['a', 'b', 'c'],
      failingKeys: ['c'],
      xmlByKey: { a: { email: VALID_EMAIL }, b: { email: INVALID_EMAIL } },
    })

    await fakes.routine.run(CONTEXT)

    const serialized = JSON.stringify(fakes.logs)
    expect(serialized).toContain('nfe_recipient_email_backfill_cycle_finished')
    expect(serialized).not.toContain(VALID_EMAIL)
    expect(serialized).not.toContain(INVALID_EMAIL)
    expect(serialized).not.toContain('storage down')
  })
})
