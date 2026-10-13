/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.2b (RF5/RF13), contra Postgres real: o filtro "Atrasadas" da lista de ocorrências. Ele vive no SQL
 * que também corta o cursor — a página vem cheia, o cursor é o mesmo (hora, id) de sempre, e a ocorrência de
 * parada, que não tem retorno da contratante, nunca casa. Outra empresa não alcança nada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  tripDocumentOccurrences,
  tripDocuments,
  tripStopOccurrences,
} from '../../src/database/database.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import type { ContractorReplyStatus } from '../../src/shared/occurrence-contractor-reply.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import type {
  TripOccurrenceFeedFilters,
  TripOccurrenceFeedPage,
} from '../../src/trips/application/trip-occurrence-feed.use-case.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function enableReplyOnType(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [occurrence] = await database.db
    .select({
      documentId: tripDocumentOccurrences.tripDocumentId,
      typeId: tripDocumentOccurrences.occurrenceTypeId,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  const typeId = occurrence?.typeId ?? ''
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, seeded.company.companyId),
        eq(companyOccurrenceTypes.id, typeId),
      ),
    )
  return typeId
}

async function registerAnother(
  database: TestDatabase,
  seeded: Seeded,
  typeId: string,
  at: Date,
): Promise<string> {
  const [link] = await database.db
    .select({ documentId: tripDocuments.id, tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, seeded.company.companyId))
    .limit(1)
  if (link === undefined) throw new Error('EXPECTED_TRIP_DOCUMENT')
  const occurrence = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: seeded.company.userId,
      companyId: seeded.company.companyId,
      documentId: link.documentId,
      items: [],
      note: 'outra caixa com avaria',
      occurrenceTypeId: typeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'blocked',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: link.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => at,
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
  return occurrence.id
}

async function openReplyOf(
  database: TestDatabase,
  companyId: string,
  occurrenceId: string,
): Promise<void> {
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({ companyId, correlationId: `correlation-${crypto.randomUUID()}`, occurrenceId })
}

async function setStatus(
  database: TestDatabase,
  seeded: Seeded,
  occurrenceId: string,
  status: ContractorReplyStatus,
): Promise<void> {
  await database.db
    .update(occurrenceContractorReplies)
    .set({
      alertCount: status === 'overdue' ? 2 : 0,
      status,
      ...(status === 'handled'
        ? { handledByUserId: seeded.company.userId, handledNote: 'tratado por telefone' }
        : {}),
    })
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, seeded.company.companyId),
        eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
      ),
    )
}

/**
 * O cursor guarda a hora em milissegundos (`Date`) e o banco em microssegundos: com a hora de produção, a ordem
 * crescente repete a última linha da página (achado à parte, anterior à 248). Aqui as horas são de milissegundo
 * cheio e distintas, para provar o filtro e não essa borda.
 */
async function pinCreatedAt(database: TestDatabase, ids: readonly string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await database.db
      .update(tripDocumentOccurrences)
      .set({ createdAt: new Date(Date.UTC(2026, 8, 22, 12, index, 0, 0)) })
      .where(eq(tripDocumentOccurrences.id, id))
  }
}

async function insertStopOccurrence(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [link] = await database.db
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, seeded.company.companyId))
    .limit(1)
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: seeded.company.userId,
    channel: 'driver_app',
    companyId: seeded.company.companyId,
    description: 'doca fechada',
    id,
    kind: 'dock_closed',
    stopId: link?.stopId ?? '',
  })
  return id
}

function list(
  database: TestDatabase,
  seeded: Seeded,
  options: {
    readonly cursor?: null | string
    readonly filters?: TripOccurrenceFeedFilters
    readonly limit?: number
    readonly order?: 'asc' | 'desc'
  } = {},
): Promise<TripOccurrenceFeedPage> {
  return listTripOccurrenceFeed(database.db, {
    companyId: seeded.company.companyId,
    cursor: options.cursor ?? null,
    ...(options.filters === undefined ? {} : { filters: options.filters }),
    limit: options.limit ?? 50,
    order: options.order ?? 'desc',
  })
}

const OVERDUE_ONLY: TripOccurrenceFeedFilters = { contractorReplyStatusIn: ['overdue'] }

type Scenario = {
  readonly delivered: string
  readonly overdue: readonly string[]
  readonly seeded: Seeded
  readonly stop: string
  readonly waiting: string
}

/** Cinco ocorrências de nota com retorno (três atrasadas, uma entregue, uma aguardando) e uma de parada. */
async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const seeded = await seedMailScenario(database)
  const typeId = await enableReplyOnType(database, seeded)
  const ids = [seeded.occurrenceId]
  for (const minute of [1, 2, 3, 4]) {
    ids.push(
      await registerAnother(database, seeded, typeId, new Date(`2026-09-22T12:0${minute}:00.000Z`)),
    )
  }
  for (const id of ids) await openReplyOf(database, seeded.company.companyId, id)

  const [first, second, third, fourth, fifth] = ids as [string, string, string, string, string]
  for (const id of [first, second, third]) {
    await setStatus(database, seeded, id, 'overdue')
  }
  await setStatus(database, seeded, fourth, 'delivered')
  await pinCreatedAt(database, ids)
  return {
    delivered: fourth,
    overdue: [first, second, third],
    seeded,
    stop: await insertStopOccurrence(database, seeded),
    waiting: fifth,
  }
}

describe('o filtro "Atrasadas" da lista de ocorrências (spec 248 T5.2b)', () => {
  testWithPostgres(
    'devolve só as atrasadas, com o selo, e deixa de fora a entregue, a aguardando e a parada',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)

        const page = await list(database, scenario.seeded, { filters: OVERDUE_ONLY })

        expect(new Set(page.items.map((item) => item.id))).toEqual(new Set(scenario.overdue))
        expect(page.nextCursor).toBeNull()
        for (const item of page.items) {
          expect(item.contractorReply).toEqual({ alertCount: 2, status: 'overdue' })
        }

        const everything = await list(database, scenario.seeded)
        expect(everything.items.map((item) => item.id)).toEqual(
          expect.arrayContaining([scenario.delivered, scenario.waiting, scenario.stop]),
        )
        expect(everything.items).toHaveLength(6)
      })
    },
  )

  testWithPostgres(
    'vários estados somam; o filtro vazio de resultado devolve página vazia e sem cursor',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)

        const both = await list(database, scenario.seeded, {
          filters: { contractorReplyStatusIn: ['overdue', 'awaiting_contractor'] },
        })
        expect(both.items).toHaveLength(4)

        const none = await list(database, scenario.seeded, {
          filters: { contractorReplyStatusIn: ['needs_operator'] },
        })
        expect(none).toEqual({ items: [], nextCursor: null })
      })
    },
  )

  testWithPostgres(
    'pagina por cursor sem repetir nem pular, nas duas ordens, e o cursor segue valendo se uma atrasada deixa de ser',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)

        for (const order of ['desc', 'asc'] as const) {
          const first = await list(database, scenario.seeded, {
            filters: OVERDUE_ONLY,
            limit: 2,
            order,
          })
          expect(first.items).toHaveLength(2)
          expect(first.nextCursor).not.toBeNull()

          const second = await list(database, scenario.seeded, {
            cursor: first.nextCursor,
            filters: OVERDUE_ONLY,
            limit: 2,
            order,
          })
          expect(second.items).toHaveLength(1)
          expect(second.nextCursor).toBeNull()

          const ids = [...first.items, ...second.items].map((item) => item.id)
          expect(new Set(ids)).toEqual(new Set(scenario.overdue))
          expect(ids).toHaveLength(3)
        }

        const first = await list(database, scenario.seeded, { filters: OVERDUE_ONLY, limit: 2 })
        const leaving = first.items[0]?.id ?? ''
        await setStatus(database, scenario.seeded, leaving, 'handled')
        const afterChange = await list(database, scenario.seeded, {
          cursor: first.nextCursor,
          filters: OVERDUE_ONLY,
          limit: 2,
        })
        expect(afterChange.items).toHaveLength(1)
        expect(afterChange.items[0]?.id).not.toBe(leaving)
        expect(afterChange.nextCursor).toBeNull()
      })
    },
  )

  testWithPostgres(
    'a atrasada de outra empresa nunca aparece (e a consulta leva a empresa)',
    async () => {
      await withConversationDatabase(async (database) => {
        const mine = await seedScenario(database)
        const other = await seedMailScenario(database)
        await enableReplyOnType(database, other)
        await openReplyOf(database, other.company.companyId, other.occurrenceId)
        await setStatus(database, other, other.occurrenceId, 'overdue')

        const theirs = await list(database, other, { filters: OVERDUE_ONLY })
        expect(theirs.items.map((item) => item.id)).toEqual([other.occurrenceId])

        const ours = await list(database, mine.seeded, { filters: OVERDUE_ONLY })
        expect(ours.items.map((item) => item.id)).not.toContain(other.occurrenceId)
        expect(ours.items).toHaveLength(3)
      })
    },
  )
})
