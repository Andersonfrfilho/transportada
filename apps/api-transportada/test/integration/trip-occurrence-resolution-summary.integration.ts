/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 277 RF5 (T3), contra Postgres real: a resolução média por tipo de ocorrência. É o mesmo dado
 * da 276 — do registro até o evento `resolved` mais recente — só que somado por tipo. Conta apenas
 * a ocorrência cujo estado de agora é resolvida: reaberta, em aberto e cancelada ficam de fora.
 */
import { describe, expect } from 'bun:test'

import {
  occurrenceConversations,
  tripOccurrenceResolutionEvents,
} from '../../src/database/occurrence-conversation.schema.js'
import { tripDocumentOccurrences, tripStopOccurrences } from '../../src/database/trip.schema.js'
import { summarizeTripOccurrenceResolution } from '../../src/trips/infrastructure/trip-occurrence-resolution-summary.query.js'
import { seedOccurrenceType } from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { insertSubjectMessage } from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import { eq } from 'drizzle-orm'

const REGISTERED_AT = new Date('2026-09-22T12:00:00.000Z')

function hoursAfter(hours: number): Date {
  return new Date(REGISTERED_AT.getTime() + hours * 3_600_000)
}

async function insertStop(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  kind: 'dock_closed' | 'long_wait',
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: company.userId,
    channel: 'driver_app',
    companyId: company.companyId,
    createdAt: REGISTERED_AT,
    description: 'parada',
    id,
    kind,
    stopId: trip.stopId,
  })
  return id
}

async function insertDocument(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  typeId: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripDocumentOccurrences).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    createdAt: REGISTERED_AT,
    id,
    note: 'nota',
    occurrenceTypeId: typeId,
    productCode: '',
    stage: 'delivery',
    tripDocumentId: trip.documentId,
  })
  return id
}

async function addEvent(
  database: TestDatabase,
  company: Company,
  input: {
    readonly at: Date
    readonly document?: string
    readonly kind: 'reopened' | 'resolved'
    readonly stop?: string
  },
): Promise<void> {
  if (input.kind === 'resolved') {
    await database.db.insert(tripOccurrenceResolutionEvents).values({
      actorKind: 'internal',
      actorUserId: company.userId,
      companyId: company.companyId,
      createdAt: input.at,
      documentOccurrenceId: input.document ?? null,
      kind: 'resolved',
      note: 'ok',
      stopOccurrenceId: input.stop ?? null,
    })
    return
  }
  /** A reabertura é do motorista e nasce de uma mensagem dele (CHECK `reopen_check`). */
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const occurrenceId = input.stop ?? input.document ?? ''
  const [conversation] = await database.db
    .insert(occurrenceConversations)
    .values({
      companyId: company.companyId,
      driverUserId,
      occurrenceId,
      occurrenceKind: input.stop === undefined ? 'document' : 'stop',
      participant: 'driver',
    })
    .returning({ id: occurrenceConversations.id })
  if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
  const messageId = await insertSubjectMessage(database.db, {
    body: 'O problema voltou',
    conversationId: conversation.id,
    createdAt: input.at,
    direction: 'inbound',
    driverUserId,
    operatorUserId: company.userId,
  })
  await database.db.insert(tripOccurrenceResolutionEvents).values({
    actorKind: 'driver',
    actorUserId: driverUserId,
    companyId: company.companyId,
    conversationMessageId: messageId,
    createdAt: input.at,
    documentOccurrenceId: input.document ?? null,
    kind: 'reopened',
    stopOccurrenceId: input.stop ?? null,
  })
}

describe('a resolução média por tipo (spec 277 RF5)', () => {
  testWithPostgres(
    'média do registro até o último "resolvida", só de quem está resolvida agora',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedOccurrenceType(database, {
          companyId: company.companyId,
          name: 'Cliente ausente',
          stage: 'delivery',
        })

        const dockA = await insertStop(database, company, trip, 'dock_closed')
        const dockB = await insertStop(database, company, trip, 'dock_closed')
        const waitReopened = await insertStop(database, company, trip, 'long_wait')
        await insertStop(database, company, trip, 'long_wait')
        await addEvent(database, company, { at: hoursAfter(1), kind: 'resolved', stop: dockA })
        await addEvent(database, company, { at: hoursAfter(3), kind: 'resolved', stop: dockB })
        await addEvent(database, company, {
          at: hoursAfter(2),
          kind: 'resolved',
          stop: waitReopened,
        })
        await addEvent(database, company, {
          at: hoursAfter(4),
          kind: 'reopened',
          stop: waitReopened,
        })

        const resolvedDocument = await insertDocument(database, company, trip, typeId)
        const cancelledDocument = await insertDocument(database, company, trip, typeId)
        await addEvent(database, company, {
          at: hoursAfter(6),
          document: resolvedDocument,
          kind: 'resolved',
        })
        await addEvent(database, company, {
          at: hoursAfter(2),
          document: cancelledDocument,
          kind: 'resolved',
        })
        await database.db
          .update(tripDocumentOccurrences)
          .set({
            cancellationReason: 'duplicada',
            cancelledAt: hoursAfter(8),
            cancelledByUserId: company.userId,
          })
          .where(eq(tripDocumentOccurrences.id, cancelledDocument))

        const summary = await summarizeTripOccurrenceResolution(database.db, {
          companyId: company.companyId,
        })

        expect(summary).toEqual([
          { averageSeconds: 6 * 3600, resolvedCount: 1, typeName: 'Cliente ausente' },
          { averageSeconds: 2 * 3600, resolvedCount: 2, typeName: 'dock_closed' },
        ])
      })
    },
  )

  testWithPostgres('uma ocorrência resolvida de novo conta pelo último "resolvida"', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const stop = await insertStop(database, company, trip, 'dock_closed')
      await addEvent(database, company, { at: hoursAfter(1), kind: 'resolved', stop })
      await addEvent(database, company, { at: hoursAfter(2), kind: 'reopened', stop })
      await addEvent(database, company, { at: hoursAfter(5), kind: 'resolved', stop })

      const summary = await summarizeTripOccurrenceResolution(database.db, {
        companyId: company.companyId,
      })
      expect(summary).toEqual([
        { averageSeconds: 5 * 3600, resolvedCount: 1, typeName: 'dock_closed' },
      ])
    })
  })

  testWithPostgres('nunca atravessa a empresa e sem resolvida devolve lista vazia', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const stop = await insertStop(database, company, trip, 'dock_closed')
      await addEvent(database, company, { at: hoursAfter(1), kind: 'resolved', stop })
      const other = await seedCompany(database)

      expect(
        await summarizeTripOccurrenceResolution(database.db, { companyId: other.companyId }),
      ).toEqual([])
    })
  })
})
