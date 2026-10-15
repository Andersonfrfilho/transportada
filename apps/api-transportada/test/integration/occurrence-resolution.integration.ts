/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.3/T2.4 (ADR-0105), contra Postgres real: o escritório resolve a ocorrência de nota e de
 * parada, a segunda resolução é 409, a cancelada é 409, outra empresa é 404, e a leitura em lote do
 * último evento por ocorrência.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripOccurrenceCaseEvents } from '../../src/database/trip.schema.js'
import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripStopOccurrences,
} from '../../src/database/trip.schema.js'
import type { OccurrenceCaseTransitionInput } from '../../src/trips/application/occurrence-case.port.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { createResolveOccurrenceUseCase } from '../../src/trips/application/resolve-occurrence.use-case.js'
import {
  DrizzleOccurrenceResolutionUnitOfWork,
  listLatestResolutionEventsByOccurrence,
} from '../../src/trips/infrastructure/drizzle-occurrence-resolution.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
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

function contextOf(company: Company): CompanyContext {
  return {
    companyId: company.companyId,
    kind: 'company',
    membershipId: crypto.randomUUID(),
    permissions: new Set(['occurrences.resolve'] as never),
    roles: ['company-admin'],
    userId: company.userId,
  }
}

function buildUseCase(database: TestDatabase) {
  return createResolveOccurrenceUseCase({
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(database.db),
  })
}

async function registerDocumentOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: occurrenceTypeId,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
  })
  const uploads: { objectId: string; objectKey: string }[] = []
  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'allowed',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage(uploads),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  return registered.id
}

async function registerStopOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    description: 'cliente fechado',
    id,
    kind: 'long_wait',
    stopId: trip.stopId,
  })
  return id
}

async function listEvents(database: TestDatabase, occurrenceId: string) {
  const events = await database.db.select().from(tripOccurrenceResolutionEvents)
  return events.filter(
    (event) =>
      event.documentOccurrenceId === occurrenceId || event.stopOccurrenceId === occurrenceId,
  )
}

describe('o escritório resolve a ocorrência contra Postgres (spec 266 T2.3)', () => {
  testWithPostgres(
    'resolve a ocorrência de nota e a de parada, e a segunda vez é 409',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const documentId = await registerDocumentOccurrence(database, company, trip)
        const stopId = await registerStopOccurrence(database, company, trip)
        const useCase = buildUseCase(database)

        for (const [occurrenceKind, occurrenceId] of [
          ['document', documentId],
          ['stop', stopId],
        ] as const) {
          const resolved = await useCase.execute({
            context: contextOf(company),
            note: 'Resolvido por telefone',
            occurrenceId,
            occurrenceKind,
          })
          expect(resolved).toMatchObject({ occurrenceId, occurrenceKind, state: 'resolved' })

          await expect(
            useCase.execute({
              context: contextOf(company),
              note: 'de novo',
              occurrenceId,
              occurrenceKind,
            }),
          ).rejects.toMatchObject({ code: 'OCCURRENCE_ALREADY_RESOLVED', status: 409 })

          const events = await listEvents(database, occurrenceId)
          expect(events).toHaveLength(1)
          expect(events[0]).toMatchObject({
            actorKind: 'internal',
            actorUserId: company.userId,
            caseEventId: null,
            kind: 'resolved',
            note: 'Resolvido por telefone',
          })
        }
      })
    },
  )

  testWithPostgres('duas resoluções simultâneas: uma grava, a outra recebe 409', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerStopOccurrence(database, company, trip)
      const useCase = buildUseCase(database)
      const attempt = () =>
        useCase.execute({
          context: contextOf(company),
          note: 'corrida',
          occurrenceId,
          occurrenceKind: 'stop',
        })

      const outcomes = await Promise.allSettled([attempt(), attempt()])

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected')
      expect(rejected).toHaveLength(1)
      expect(rejected[0]?.reason).toMatchObject({ code: 'OCCURRENCE_ALREADY_RESOLVED' })
      expect(await listEvents(database, occurrenceId)).toHaveLength(1)
    })
  })

  testWithPostgres('a ocorrência cancelada (167) responde 409 e não grava', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerDocumentOccurrence(database, company, trip)
      await database.db
        .update(tripDocumentOccurrences)
        .set({
          cancellationReason: 'aberta por engano',
          cancelledAt: new Date(),
          cancelledByUserId: company.userId,
        })
        .where(eq(tripDocumentOccurrences.id, occurrenceId))

      await expect(
        buildUseCase(database).execute({
          context: contextOf(company),
          note: 'tentativa',
          occurrenceId,
          occurrenceKind: 'document',
        }),
      ).rejects.toMatchObject({ code: 'OCCURRENCE_CANCELLED', status: 409 })
      expect(await listEvents(database, occurrenceId)).toHaveLength(0)
    })
  })

  testWithPostgres('outra empresa e id inexistente respondem 404 e não gravam', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const otherCompany = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const documentId = await registerDocumentOccurrence(database, company, trip)
      const stopId = await registerStopOccurrence(database, company, trip)
      const useCase = buildUseCase(database)

      for (const [occurrenceKind, occurrenceId] of [
        ['document', documentId],
        ['stop', stopId],
        ['stop', crypto.randomUUID()],
        ['document', stopId],
      ] as const) {
        await expect(
          useCase.execute({
            context: contextOf(otherCompany),
            note: 'invasão',
            occurrenceId,
            occurrenceKind,
          }),
        ).rejects.toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND', status: 404 })
      }
      await expect(
        useCase.execute({
          context: contextOf(company),
          note: 'tipo trocado',
          occurrenceId: stopId,
          occurrenceKind: 'document',
        }),
      ).rejects.toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND' })
      expect(await database.db.select().from(tripOccurrenceResolutionEvents)).toHaveLength(0)
    })
  })

  testWithPostgres('o último evento de N ocorrências vem em lote, por empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const otherCompany = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const first = await registerStopOccurrence(database, company, trip)
      const second = await registerStopOccurrence(database, company, trip)
      const untouched = await registerStopOccurrence(database, company, trip)
      const useCase = buildUseCase(database)
      for (const occurrenceId of [first, second]) {
        await useCase.execute({
          context: contextOf(company),
          note: 'ok',
          occurrenceId,
          occurrenceKind: 'stop',
        })
      }

      const latest = await listLatestResolutionEventsByOccurrence(database.db, {
        companyId: company.companyId,
        occurrenceIds: [first, second, untouched],
        occurrenceKind: 'stop',
      })
      expect([...latest.keys()].sort()).toEqual([first, second].sort())
      expect(latest.get(first)?.map((fact) => fact.kind)).toEqual(['resolved'])

      const foreign = await listLatestResolutionEventsByOccurrence(database.db, {
        companyId: otherCompany.companyId,
        occurrenceIds: [first, second],
        occurrenceKind: 'stop',
      })
      expect(foreign.size).toBe(0)
    })
  })
})

type CaseAction = OccurrenceCaseTransitionInput['action']

async function applyCaseActions(
  database: TestDatabase,
  company: Company,
  occurrenceId: string,
  actions: readonly CaseAction[],
): Promise<void> {
  const cases = new DrizzleOccurrenceCaseRepository(database.db)
  const caseId = await cases.findIdByOccurrenceId({ companyId: company.companyId, occurrenceId })
  if (caseId === null) throw new Error('EXPECTED_CASE')
  for (const action of actions) {
    const isDecision = action === 'decide'
    await cases.transition({
      action,
      actorKind: isDecision ? 'contractor' : 'internal',
      actorUserId: company.userId,
      caseId,
      companyId: company.companyId,
      ...(isDecision ? { decisionKind: 'redelivery_authorized' as const } : {}),
      note: action === 'cancel' || action === 'warehouse_return' ? 'motivo registrado' : '',
    })
  }
}

describe('a tratativa terminal resolve a ocorrência pelo sistema (spec 266 T2.4)', () => {
  const TERMINAL_PATHS = [
    { actions: ['review', 'contractor_submission', 'decide', 'closure'], status: 'closed' },
    { actions: ['review', 'warehouse_return'], status: 'returned_to_warehouse' },
    { actions: ['cancel'], status: 'cancelled' },
  ] as const

  for (const path of TERMINAL_PATHS) {
    testWithPostgres(
      `${path.status} grava exatamente um evento system ligado ao evento da tratativa`,
      async () => {
        await withDisposableDatabase(async (database) => {
          const company = await seedCompany(database)
          const trip = await seedTrip(database, company, 'in_transit')
          const occurrenceId = await registerDocumentOccurrence(database, company, trip)

          await applyCaseActions(database, company, occurrenceId, path.actions)

          const events = await listEvents(database, occurrenceId)
          expect(events).toHaveLength(1)
          expect(events[0]).toMatchObject({
            actorKind: 'system',
            actorUserId: null,
            kind: 'resolved',
            note: null,
          })
          const [caseEvent] = await database.db
            .select({
              id: tripOccurrenceCaseEvents.id,
              toStatus: tripOccurrenceCaseEvents.toStatus,
            })
            .from(tripOccurrenceCaseEvents)
            .where(eq(tripOccurrenceCaseEvents.id, events[0]?.caseEventId ?? ''))
          expect(caseEvent?.toStatus).toBe(path.status)
        })
      },
    )
  }

  testWithPostgres('decided não é terminal e não cria evento', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerDocumentOccurrence(database, company, trip)

      await applyCaseActions(database, company, occurrenceId, [
        'review',
        'contractor_submission',
        'decide',
      ])

      expect(await listEvents(database, occurrenceId)).toHaveLength(0)
    })
  })

  testWithPostgres('já resolvida à mão: o terminal não duplica o evento', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerDocumentOccurrence(database, company, trip)
      await applyCaseActions(database, company, occurrenceId, ['review'])
      await buildUseCase(database).execute({
        context: contextOf(company),
        note: 'resolvido antes de devolver',
        occurrenceId,
        occurrenceKind: 'document',
      })

      await applyCaseActions(database, company, occurrenceId, ['warehouse_return'])

      const events = await listEvents(database, occurrenceId)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actorKind: 'internal',
        note: 'resolvido antes de devolver',
      })
    })
  })
})
