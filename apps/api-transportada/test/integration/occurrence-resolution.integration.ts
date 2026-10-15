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
import { buildOccurrenceTimeline } from '../../src/trips/domain/occurrence-timeline.policy.js'
import type { FeedResolutionStateFilter } from '../../src/trips/domain/occurrence-resolution.types.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import { createOccurrenceResolutionNotifier } from '../../src/trips/infrastructure/occurrence-resolution-notifier.gateway.js'
import { trips } from '../../src/database/trip.schema.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
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
  typeName = 'Caixa violada',
): Promise<string> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: occurrenceTypeId,
    name: typeName,
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
      typeName,
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

  testWithPostgres(
    'corrida terminal × resolução manual: um único evento resolved, qualquer que seja o vencedor',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)
        await applyCaseActions(database, company, occurrenceId, ['review'])

        const outcomes = await Promise.allSettled([
          buildUseCase(database).execute({
            context: contextOf(company),
            note: 'resolvido à mão',
            occurrenceId,
            occurrenceKind: 'document',
          }),
          applyCaseActions(database, company, occurrenceId, ['warehouse_return']),
        ])

        const rejected = outcomes.filter((outcome) => outcome.status === 'rejected')
        expect(rejected.length).toBeLessThanOrEqual(1)
        if (rejected[0] !== undefined) {
          expect(rejected[0].reason).toMatchObject({ code: 'OCCURRENCE_ALREADY_RESOLVED' })
        }
        const events = await listEvents(database, occurrenceId)
        expect(events.filter((event) => event.kind === 'resolved')).toHaveLength(1)
      })
    },
  )

  testWithPostgres('duas resoluções simultâneas da ocorrência de nota: uma grava', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerDocumentOccurrence(database, company, trip)
      const useCase = buildUseCase(database)
      const attempt = () =>
        useCase.execute({
          context: contextOf(company),
          note: 'corrida',
          occurrenceId,
          occurrenceKind: 'document',
        })

      const outcomes = await Promise.allSettled([attempt(), attempt()])

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(await listEvents(database, occurrenceId)).toHaveLength(1)
    })
  })
})

type SentNotice = {
  readonly dedupeKey: string
  readonly payload: Record<string, unknown>
  readonly recipientUserId: string
  readonly templateKey: string
}

function buildNoticeWorld(database: TestDatabase, canResolve: () => boolean = () => true) {
  const sent: SentNotice[] = []
  const logs: { event: string; meta: unknown }[] = []
  const notifier = createOccurrenceResolutionNotifier({
    canUserResolveOccurrences: async () => canResolve(),
    logger: {
      info: (event, meta) => void logs.push({ event, meta }),
      warn: (event, meta) => void logs.push({ event, meta }),
    },
    queryable: database.db,
    send: async (params) => void sent.push(params as SentNotice),
  })
  return { logs, notifier, sent }
}

describe('os avisos do andamento da ocorrência (spec 266 T2.8)', () => {
  testWithPostgres(
    'resolvida: a tripulação inteira recebe, sem a nota; viagem terminada não envia',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const helperUserId = await linkDriverMembership(database, company, company.secondDriverId)
        const world = buildNoticeWorld(database)
        const useCase = createResolveOccurrenceUseCase({
          logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
          notifier: world.notifier,
          unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(database.db),
        })

        await useCase.execute({
          context: contextOf(company),
          note: 'SEGREDO-DA-OBSERVACAO',
          occurrenceId,
          occurrenceKind: 'document',
        })

        expect(world.sent.map((notice) => notice.recipientUserId).toSorted()).toEqual(
          [driverUserId, helperUserId].toSorted(),
        )
        for (const notice of world.sent) {
          expect(notice.templateKey).toBe('trip.occurrence-resolved')
          expect(notice.payload).toEqual({
            occurrenceKind: 'document',
            subjectId: occurrenceId,
            subjectType: 'occurrence',
            typeName: 'Caixa violada',
          })
          expect(JSON.stringify(notice)).not.toContain('SEGREDO')
        }

        await database.db
          .update(trips)
          .set({ status: 'completed' })
          .where(eq(trips.id, trip.tripId))
        const stopId = await registerStopOccurrence(database, company, trip)
        const before = world.sent.length
        await useCase.execute({
          context: contextOf(company),
          note: 'viagem acabou',
          occurrenceId: stopId,
          occurrenceKind: 'stop',
        })
        expect(world.sent).toHaveLength(before)
      })
    },
  )

  testWithPostgres(
    'a tratativa terminal avisa a tripulação uma vez, ligada ao evento da tratativa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const world = buildNoticeWorld(database)
        const cases = new DrizzleOccurrenceCaseRepository(database.db, world.notifier)
        const caseId = await cases.findIdByOccurrenceId({
          companyId: company.companyId,
          occurrenceId,
        })
        if (caseId === null) throw new Error('EXPECTED_CASE')

        await cases.transition({
          action: 'review',
          actorKind: 'internal',
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          note: '',
        })
        expect(world.sent).toHaveLength(0)
        await cases.transition({
          action: 'warehouse_return',
          actorKind: 'internal',
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          note: 'NOTA-INTERNA-DA-TRATATIVA',
        })

        expect(world.sent).toHaveLength(1)
        expect(world.sent[0]).toMatchObject({
          recipientUserId: driverUserId,
          templateKey: 'trip.occurrence-resolved',
        })
        expect(JSON.stringify(world.sent)).not.toContain('NOTA-INTERNA')
      })
    },
  )

  testWithPostgres(
    'reaberta: avisa quem resolveu (ou quem moveu a tratativa), sem texto; perdeu a permissão, não avisa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const manualId = await registerStopOccurrence(database, company, trip)
        const caseOccurrenceId = await registerDocumentOccurrence(database, company, trip)
        let canResolve = true
        const world = buildNoticeWorld(database, () => canResolve)
        const resolve = createResolveOccurrenceUseCase({
          logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
          unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(database.db),
        })
        await resolve.execute({
          context: contextOf(company),
          note: 'ok',
          occurrenceId: manualId,
          occurrenceKind: 'stop',
        })
        await applyCaseActions(database, company, caseOccurrenceId, ['cancel'])
        const messageId = crypto.randomUUID()

        await world.notifier.notifyReopened({
          companyId: company.companyId,
          messageId,
          occurrenceId: manualId,
        })
        await world.notifier.notifyReopened({
          companyId: company.companyId,
          messageId,
          occurrenceId: caseOccurrenceId,
        })
        expect(world.sent).toHaveLength(2)
        for (const notice of world.sent) {
          expect(notice.recipientUserId).toBe(company.userId)
          expect(notice.templateKey).toBe('trip.occurrence-reopened')
          expect(Object.keys(notice.payload).toSorted()).toEqual([
            'occurrenceId',
            'occurrenceKind',
            'tripId',
            'typeName',
          ])
        }

        canResolve = false
        await world.notifier.notifyReopened({
          companyId: company.companyId,
          messageId: crypto.randomUUID(),
          occurrenceId: manualId,
        })
        expect(world.sent).toHaveLength(2)
        expect(world.logs.at(-1)).toMatchObject({
          event: 'occurrence.resolution.reopened_notice_skipped',
        })
      })
    },
  )
})

describe('o andamento na linha do tempo e no feed do painel (spec 266 T2.9)', () => {
  testWithPostgres(
    'resolução do sistema: frase fixa, sem nota; filtro e item do feed; parada resolvida à mão',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const caseOccurrenceId = await registerDocumentOccurrence(database, company, trip)
        const stopOccurrenceId = await registerStopOccurrence(database, company, trip)
        const openOccurrenceId = await registerDocumentOccurrence(
          database,
          company,
          trip,
          'Item avariado',
        )
        await applyCaseActions(database, company, caseOccurrenceId, ['cancel'])
        await buildUseCase(database).execute({
          context: contextOf(company),
          note: 'Resolvido por telefone',
          occurrenceId: stopOccurrenceId,
          occurrenceKind: 'stop',
        })

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId: company.companyId,
          occurrenceId: caseOccurrenceId,
        })
        const [systemEvent] = buildOccurrenceTimeline({ sources: sources ?? [] }).events.filter(
          (event) => event.kind === 'resolution.resolved',
        )
        expect(systemEvent).toMatchObject({
          actor: { kind: 'system', name: null },
          note: null,
          phraseKey: 'case_cancelled',
        })

        const feed = (states: readonly FeedResolutionStateFilter[]) =>
          listTripOccurrenceFeed(database.db, {
            companyId: company.companyId,
            cursor: null,
            filters: { resolutionStateIn: states },
            limit: 50,
            order: 'desc',
          })
        const idsOf = async (states: readonly FeedResolutionStateFilter[]) =>
          (await feed(states)).items.map((item) => item.id).toSorted()
        expect(await idsOf(['resolved'])).toEqual([caseOccurrenceId, stopOccurrenceId].toSorted())
        expect(await idsOf(['open'])).toEqual([openOccurrenceId])
        expect(await idsOf(['reopened', 'cancelled'])).toEqual([])

        const all = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 50,
          order: 'desc',
        })
        const byId = new Map(all.items.map((item) => [item.id, item.resolution]))
        expect(byId.get(openOccurrenceId)).toBeNull()
        expect(byId.get(stopOccurrenceId)).toMatchObject({
          actorKind: 'internal',
          state: 'resolved',
        })
        expect(byId.get(caseOccurrenceId)).toMatchObject({ actorKind: 'system', state: 'resolved' })
      })
    },
  )
})
