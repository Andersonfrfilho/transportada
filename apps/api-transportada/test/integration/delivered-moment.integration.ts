/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 D3/CA3 (T1.5) contra o Postgres de verdade: o evento do motorista é gravado com a hora do
 * toque corrigida pelo desvio do relógio, e o "momento da entrega" que a nota, o comprovante e a
 * lista de pendências leem é `occurred_at ?? captured_at ?? recorded_at` — a mesma expressão nos
 * três, para eles não discordarem na fronteira da janela nem na do `effectiveSince`.
 *
 * A hora corrigida só vale com posição no relato (D4b, T1.5b): sem GPS, vale o horário de envio.
 *
 * A hora de recebimento é a do relógio real: o `recorded_at` do motorista nasce do `now()` do banco,
 * então o teste não pode congelar o relógio como os outros da nota.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { tripDeliveryProofs, tripStopEvents } from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { ReportedLocation } from '../../src/trips/application/driver-field-report.port.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import type { EventClockFields } from '../../src/trips/domain/occurred-at.policy.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import {
  FAKE_ENVELOPE,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const SCORE_WINDOW = 90 * DAY
/** O aparelho atrasado 90 s: o servidor soma isto à hora do toque. */
const CLOCK_OFFSET_MS = 90 * SECOND
/** Passado o prazo de "ausente" (24 h do recebimento), a entrega sem foto vira penalidade com data. */
const SCORE_READ_DELAY = 25 * HOUR

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

type EventRow = {
  readonly capturedAt: Date | null
  readonly clockOffsetMs: number | null
  readonly createdAt: Date
  readonly id: string
  readonly occurredAt: Date | null
  readonly recordedAt: Date
  readonly tappedAt: Date | null
}

async function seedWorld(
  database: TestDatabase,
  input: { readonly effectiveSince: Date; readonly receivedAt: Date },
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date(input.receivedAt.getTime() - 6 * HOUR))
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  await database.db.insert(companyDeliveryProofSettings).values({
    companyId: company.companyId,
    photo: 'required',
    scoreEffectiveSince: input.effectiveSince,
  })

  return { company, database, driverUserId, trip }
}

function deliver(
  world: World,
  input: {
    readonly clock?: EventClockFields
    readonly key: string
    readonly location?: ReportedLocation
    readonly receivedAt: Date
  },
) {
  return reportDocumentDelivery({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key,
    location: input.location ?? null,
    now: input.receivedAt,
    ...input.clock,
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
  })
}

async function readEvents(
  world: World,
  kind: 'arrived' | 'delivered' | 'returned',
): Promise<EventRow[]> {
  return world.database.db
    .select({
      capturedAt: tripStopEvents.capturedAt,
      clockOffsetMs: tripStopEvents.clockOffsetMs,
      createdAt: tripStopEvents.createdAt,
      id: tripStopEvents.id,
      occurredAt: tripStopEvents.occurredAt,
      recordedAt: tripStopEvents.recordedAt,
      tappedAt: tripStopEvents.tappedAt,
    })
    .from(tripStopEvents)
    .where(
      and(
        eq(tripStopEvents.companyId, world.company.companyId),
        eq(tripStopEvents.stopId, world.trip.stopId),
        eq(tripStopEvents.kind, kind),
      ),
    )
}

async function readSingleEvent(
  world: World,
  kind: 'arrived' | 'delivered' | 'returned',
): Promise<EventRow> {
  const rows = await readEvents(world, kind)
  expect(rows).toHaveLength(1)
  const [row] = rows
  if (row === undefined) throw new Error('evento não gravado')

  return row
}

/** O momento da entrega pelos três leitores: a nota, o comprovante e a lista de pendências. */
async function readDeliveredMoments(world: World, input: { readonly now: Date }) {
  const event = await readSingleEvent(world, 'delivered')
  const score = await new DrizzleDriverScoreRepository(world.database.db).readPenalties({
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    now: input.now,
  })
  const pending = await new DrizzleCurrentDriverTripRepository(world.database.db).listPendingProofs(
    {
      companyId: world.company.companyId,
      driverId: world.company.firstDriverId,
      now: input.now,
    },
  )
  const context = await new DrizzleDeliveryProofRepository(
    world.database.db,
    'test-bucket',
  ).findDeliveryContext({ companyId: world.company.companyId, eventId: event.id })

  return {
    context: context.deliveredAt.toISOString(),
    pending: pending.map((proof) => proof.deliveredAt),
    score: score.penalties.map((penalty) => ({
      deliveredAt: new Date(penalty.expiresAt.getTime() - SCORE_WINDOW).toISOString(),
      reason: penalty.reason,
    })),
  }
}

function arrive(
  world: World,
  input: {
    readonly clock: EventClockFields
    readonly key: string
    readonly location?: ReportedLocation
    readonly receivedAt: Date
  },
) {
  return reportStopArrival({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key,
    location: input.location ?? null,
    now: input.receivedAt,
    ...input.clock,
    stopId: world.trip.stopId,
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
  })
}

function readScore(world: World, now: Date) {
  return new DrizzleDriverScoreRepository(world.database.db).readPenalties({
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    now,
  })
}

function readPending(world: World, now: Date) {
  return new DrizzleCurrentDriverTripRepository(world.database.db).listPendingProofs({
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    now,
  })
}

/** Entrega tocada 4 h antes do recebimento, num aparelho 90 s atrasado. */
function correctedClock(receivedAt: Date): {
  readonly clock: Required<EventClockFields>
  readonly occurredAt: Date
} {
  const occurredAt = new Date(receivedAt.getTime() - 4 * HOUR)

  return {
    clock: {
      clockOffsetMs: CLOCK_OFFSET_MS,
      tappedAt: new Date(occurredAt.getTime() - CLOCK_OFFSET_MS),
    },
    occurredAt,
  }
}

/** O GPS leu no mesmo toque, com a hora do aparelho — a prova de lugar que faz a correção valer. */
function positionAt(tappedAt: Date): ReportedLocation {
  return {
    accuracyMeters: '12.00',
    capturedAt: tappedAt.toISOString(),
    latitude: '-23.5505199',
    longitude: '-46.6333094',
  }
}

function longAgo(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() - 200 * DAY)
}

describe('o momento da entrega é a hora corrigida do toque (spec 232 D3, CA3)', () => {
  testWithPostgres(
    'CA3: tocada às 10:00 com posição e recebida às 14:00, com os campos, é entregue às 10:00',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock, occurredAt } = correctedClock(receivedAt)

        await deliver(world, {
          clock,
          key: 'ca3',
          location: positionAt(clock.tappedAt),
          receivedAt,
        })

        const event = await readSingleEvent(world, 'delivered')
        expect(event.occurredAt?.toISOString()).toBe(occurredAt.toISOString())
        expect(event.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
        expect(event.tappedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
        // O GPS leu no mesmo toque, com a hora crua do aparelho: o `captured_at` não é a corrigida.
        expect(event.capturedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
        // O campo novo não é o `occurredAt` do escritório: `created_at` continua a hora da gravação.
        expect(event.createdAt.toISOString()).toBe(event.recordedAt.toISOString())
        expect(event.recordedAt.getTime()).toBeGreaterThan(occurredAt.getTime() + 3 * HOUR)

        const moments = await readDeliveredMoments(world, {
          now: new Date(receivedAt.getTime() + SCORE_READ_DELAY),
        })
        expect(moments).toEqual({
          context: occurredAt.toISOString(),
          pending: [occurredAt.toISOString()],
          score: [{ deliveredAt: occurredAt.toISOString(), reason: 'missing_proof' }],
        })
      })
    },
  )

  testWithPostgres(
    'CA3/D4b: a mesma entrega sem posição (GPS desligado) vale o horário de envio, não grava a corrigida',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock } = correctedClock(receivedAt)

        await deliver(world, { clock, key: 'ca3-sem-posicao', receivedAt })

        const event = await readSingleEvent(world, 'delivered')
        expect(event.occurredAt).toBeNull()
        expect(event.clockOffsetMs).toBeNull()
        // A hora crua do aparelho fica registrada (spec 206), mas não vale como momento.
        expect(event.tappedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
        expect(event.capturedAt).toBeNull()
        const recordedAt = event.recordedAt.toISOString()
        const moments = await readDeliveredMoments(world, {
          now: new Date(receivedAt.getTime() + SCORE_READ_DELAY),
        })
        expect(moments).toEqual({
          context: recordedAt,
          pending: [recordedAt],
          score: [{ deliveredAt: recordedAt, reason: 'missing_proof' }],
        })
      })
    },
  )

  testWithPostgres(
    'com posição, a hora corrigida vence a leitura do GPS no relógio cru do aparelho',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock, occurredAt } = correctedClock(receivedAt)
        const location = positionAt(clock.tappedAt)

        await deliver(world, { clock, key: 'com-posicao', location, receivedAt })

        const event = await readSingleEvent(world, 'delivered')
        expect(event.capturedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
        expect(event.occurredAt?.toISOString()).toBe(occurredAt.toISOString())
        const moments = await readDeliveredMoments(world, {
          now: new Date(receivedAt.getTime() + SCORE_READ_DELAY),
        })
        expect(moments).toEqual({
          context: occurredAt.toISOString(),
          pending: [occurredAt.toISOString()],
          score: [{ deliveredAt: occurredAt.toISOString(), reason: 'missing_proof' }],
        })
      })
    },
  )

  testWithPostgres(
    'a janela de 90 dias da nota conta da hora corrigida, não do recebimento',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock, occurredAt } = correctedClock(receivedAt)
        await deliver(world, {
          clock,
          key: 'janela',
          location: positionAt(clock.tappedAt),
          receivedAt,
        })

        // 90 dias + 1 h depois da hora corrigida: ela saiu da janela; o recebimento (4 h depois) não.
        const now = new Date(occurredAt.getTime() + SCORE_WINDOW + HOUR)

        expect(await readScore(world, now)).toEqual({ penalties: [], score: null })
        expect(await readPending(world, now)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'cliente antigo, sem os campos: o momento é o de hoje (captured_at ?? recorded_at)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })

        await deliver(world, { key: 'antigo', receivedAt })

        const event = await readSingleEvent(world, 'delivered')
        expect(event).toMatchObject({ clockOffsetMs: null, occurredAt: null, tappedAt: null })
        const recordedAt = event.recordedAt.toISOString()
        const moments = await readDeliveredMoments(world, {
          now: new Date(receivedAt.getTime() + SCORE_READ_DELAY),
        })
        expect(moments).toEqual({
          context: recordedAt,
          pending: [recordedAt],
          score: [{ deliveredAt: recordedAt, reason: 'missing_proof' }],
        })

        // O espelho da janela: pelo recebimento, a mesma leitura ainda está dentro dos 90 dias.
        const now = new Date(receivedAt.getTime() - 4 * HOUR + SCORE_WINDOW + HOUR)
        expect((await readScore(world, now)).penalties).toHaveLength(1)
        expect(await readPending(world, now)).toHaveLength(1)
      })
    },
  )

  for (const discarded of [
    { name: 'no futuro (+1 h)', tappedAfterReceivedMs: HOUR },
    { name: 'velha demais (−31 dias)', tappedAfterReceivedMs: -31 * DAY },
  ]) {
    testWithPostgres(
      `correção descartada ${discarded.name}: grava a decisão (sem occurred_at) e lê como hoje`,
      async () => {
        await withDisposableDatabase(async (database) => {
          const receivedAt = new Date()
          const world = await seedWorld(database, {
            effectiveSince: longAgo(receivedAt),
            receivedAt,
          })
          const tappedAt = new Date(receivedAt.getTime() + discarded.tappedAfterReceivedMs)

          await deliver(world, {
            clock: { clockOffsetMs: 0, tappedAt },
            key: 'descarte',
            receivedAt,
          })

          const event = await readSingleEvent(world, 'delivered')
          expect(event.occurredAt).toBeNull()
          expect(event.clockOffsetMs).toBeNull()
          // A hora crua do aparelho fica registrada (spec 206), mas não vale como momento.
          expect(event.tappedAt?.toISOString()).toBe(tappedAt.toISOString())
          const recordedAt = event.recordedAt.toISOString()
          const moments = await readDeliveredMoments(world, {
            now: new Date(receivedAt.getTime() + SCORE_READ_DELAY),
          })
          expect(moments).toEqual({
            context: recordedAt,
            pending: [recordedAt],
            score: [{ deliveredAt: recordedAt, reason: 'missing_proof' }],
          })
        })
      },
    )
  }

  testWithPostgres(
    'o reenvio da mesma entrega não regrava a hora — nem pela mesma chave, nem por chave nova',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock, occurredAt } = correctedClock(receivedAt)
        const first = await deliver(world, {
          clock,
          key: 'reenvio',
          location: positionAt(clock.tappedAt),
          receivedAt,
        })
        const other = {
          clockOffsetMs: 0,
          tappedAt: new Date(receivedAt.getTime() - HOUR),
        }

        const sameKey = await deliver(world, { clock: other, key: 'reenvio', receivedAt })
        const newKey = await deliver(world, { clock: other, key: 'reenvio-2', receivedAt })

        expect(sameKey.id).toBe(first.id)
        expect(newKey).toMatchObject({ alreadySettled: true, id: first.id })
        const event = await readSingleEvent(world, 'delivered')
        expect(event.id).toBe(first.id)
        expect(event.occurredAt?.toISOString()).toBe(occurredAt.toISOString())
        expect(event.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
      })
    },
  )

  testWithPostgres(
    'a nota e a lista de pendências usam o mesmo instante na fronteira do effectiveSince',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        // A ativação da nota cai entre a hora corrigida (−4 h) e o recebimento.
        const world = await seedWorld(database, {
          effectiveSince: new Date(receivedAt.getTime() - 2 * HOUR),
          receivedAt,
        })
        const { clock } = correctedClock(receivedAt)
        await deliver(world, {
          clock,
          key: 'fronteira',
          location: positionAt(clock.tappedAt),
          receivedAt,
        })
        const now = new Date(receivedAt.getTime() + SCORE_READ_DELAY)

        expect(await readScore(world, now)).toEqual({ penalties: [], score: null })
        expect(await readPending(world, now)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'espelho da fronteira: sem os campos, a entrega é posterior à ativação nos dois',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: new Date(receivedAt.getTime() - 2 * HOUR),
          receivedAt,
        })
        await deliver(world, { key: 'fronteira-antigo', receivedAt })
        const now = new Date(receivedAt.getTime() + SCORE_READ_DELAY)

        expect((await readScore(world, now)).penalties).toHaveLength(1)
        expect(await readPending(world, now)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'a chegada com posição também grava a hora corrigida, sem tocar em created_at',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock, occurredAt } = correctedClock(receivedAt)

        await arrive(world, {
          clock,
          key: 'chegada',
          location: positionAt(clock.tappedAt),
          receivedAt,
        })

        const event = await readSingleEvent(world, 'arrived')
        expect(event.occurredAt?.toISOString()).toBe(occurredAt.toISOString())
        expect(event.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
        expect(event.createdAt.toISOString()).toBe(event.recordedAt.toISOString())
      })
    },
  )

  testWithPostgres(
    'D4b: a chegada sem posição não grava a hora corrigida nem o desvio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        const { clock } = correctedClock(receivedAt)

        await arrive(world, { clock, key: 'chegada-sem-posicao', receivedAt })

        const event = await readSingleEvent(world, 'arrived')
        expect(event.occurredAt).toBeNull()
        expect(event.clockOffsetMs).toBeNull()
        expect(event.tappedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
      })
    },
  )

  for (const withLocation of [true, false]) {
    testWithPostgres(
      `a devolução ${withLocation ? 'com' : 'sem'} posição ${withLocation ? 'grava' : 'não grava'} a hora corrigida e o desvio`,
      async () => {
        await withDisposableDatabase(async (database) => {
          const receivedAt = new Date()
          const world = await seedWorld(database, {
            effectiveSince: longAgo(receivedAt),
            receivedAt,
          })
          const { clock, occurredAt } = correctedClock(receivedAt)

          await reportDocumentReturn({
            actorUserId: world.driverUserId,
            companyId: world.company.companyId,
            documentId: world.trip.documentId,
            driverId: world.company.firstDriverId,
            idempotencyKey: 'devolucao',
            location: withLocation ? positionAt(clock.tappedAt) : null,
            now: receivedAt,
            ...clock,
            reason: 'recipient_absent',
            unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
          })

          const event = await readSingleEvent(world, 'returned')
          expect(event.tappedAt?.toISOString()).toBe(clock.tappedAt.toISOString())
          expect(event.occurredAt?.toISOString()).toBe(
            withLocation ? occurredAt.toISOString() : undefined,
          )
          expect(event.clockOffsetMs).toBe(withLocation ? CLOCK_OFFSET_MS : null)
        })
      },
    )
  }
})

describe('a foto guarda o desvio que a julgou (spec 232 D4, risco 5 da T1.5)', () => {
  testWithPostgres(
    'foto com relógio corrigido grava clock_offset_ms; sem o campo, fica nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const receivedAt = new Date()
        const world = await seedWorld(database, {
          effectiveSince: longAgo(receivedAt),
          receivedAt,
        })
        await deliver(world, { key: 'entrega-da-foto', receivedAt })
        const capturedAt = new Date(receivedAt.getTime() - 10 * 60 * SECOND)

        await attachProof(world, receivedAt, {
          capturedAt: capturedAt.toISOString(),
          clockOffsetMs: String(CLOCK_OFFSET_MS),
          kind: 'photo',
        })
        await attachProof(world, receivedAt, { kind: 'cargo' })

        const rows = await database.db
          .select({
            capturedAt: tripDeliveryProofs.capturedAt,
            clockOffsetMs: tripDeliveryProofs.clockOffsetMs,
            kind: tripDeliveryProofs.kind,
          })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.companyId, world.company.companyId))
          .orderBy(tripDeliveryProofs.kind)

        expect(rows).toEqual([
          { capturedAt: null, clockOffsetMs: null, kind: 'cargo' },
          // O `captured_at` continua a hora crua do aparelho; o desvio é a auditoria do veredito.
          { capturedAt, clockOffsetMs: CLOCK_OFFSET_MS, kind: 'photo' },
        ])
      })
    },
  )

  testWithPostgres('foto com correção descartada (futuro) não grava o desvio', async () => {
    await withDisposableDatabase(async (database) => {
      const receivedAt = new Date()
      const world = await seedWorld(database, {
        effectiveSince: longAgo(receivedAt),
        receivedAt,
      })
      await deliver(world, { key: 'entrega-da-foto-futura', receivedAt })

      await attachProof(world, receivedAt, {
        capturedAt: new Date(receivedAt.getTime() + HOUR).toISOString(),
        clockOffsetMs: '0',
        kind: 'photo',
      })

      const [row] = await database.db
        .select({ clockOffsetMs: tripDeliveryProofs.clockOffsetMs })
        .from(tripDeliveryProofs)
        .where(eq(tripDeliveryProofs.companyId, world.company.companyId))
      expect(row).toEqual({ clockOffsetMs: null })
    })
  })
})

/** O multipart que a app manda, lido pela mesma função da rota (`parseDeliveryProofUpload`). */
async function attachProof(
  world: World,
  receivedAt: Date,
  fields: Readonly<Record<string, string>>,
): Promise<void> {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'comprovante.jpg', { type: 'image/jpeg' }))
  for (const [name, value] of Object.entries(fields)) form.set(name, value)

  await attachDeliveryProof({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: receivedAt,
    repository: new DrizzleDeliveryProofRepository(world.database.db, 'test-bucket'),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
    upload: await parseDeliveryProofUpload(
      new Request('http://localhost/me/trips/current/documents/x/proof', {
        body: form,
        method: 'POST',
      }),
    ),
  })
}
