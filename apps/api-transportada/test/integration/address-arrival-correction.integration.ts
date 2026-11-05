/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T3.1 (ADR-0113 §2) contra o Postgres de verdade: o ponto da chegada da tripulação corrige o
 * cadastro do endereço, vira sugestão ao escritório ou nada, e nunca derruba a chegada.
 */
import { describe, expect } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import { addressCorrectionSuggestions } from '../../src/database/address-correction-suggestion.schema.js'
import { geocodedAddressCorrections } from '../../src/database/geocoded-address-correction.schema.js'
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import { tripStopEvents, tripStops } from '../../src/database/trip.schema.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { listTripTimeline } from '../../src/trips/infrastructure/trip-timeline.query.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const BASE_LATITUDE = -23.55
const BASE_LONGITUDE = -46.63
const NORTH_200_METRES = BASE_LATITUDE + 0.0018
const NORTH_500_METRES = BASE_LATITUDE + 0.0045
const NORTH_5_KILOMETRES = BASE_LATITUDE + 0.045

type World = Readonly<{
  addressKey: string
  company: Company
  database: TestDatabase
  driverUserId: string
  logs: { readonly level: string; readonly message: string; readonly metadata?: object }[]
  trip: SeededTrip
}>

async function seedWorld(
  database: TestDatabase,
  current: { readonly precision: 'city' | 'postal_code' | 'rooftop' } | null,
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'dispatched')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const [stop] = await database.db
    .select({ addressKey: tripStops.addressKey })
    .from(tripStops)
    .where(eq(tripStops.id, trip.stopId))
  const addressKey = stop?.addressKey ?? ''
  if (current !== null) {
    await database.db.insert(geocodedAddresses).values({
      addressKey,
      externalPlaceId: current.precision === 'rooftop' ? 'place-1' : '',
      latitude: String(BASE_LATITUDE),
      longitude: String(BASE_LONGITUDE),
      precision: current.precision,
      source: current.precision === 'rooftop' ? 'google' : current.precision,
    })
  }

  return { addressKey, company, database, driverUserId, logs: [], trip }
}

function unitOfWorkFor(world: World): DrizzleDriverFieldReportUnitOfWork {
  const record = (level: string) => (message: string, metadata?: object) => {
    world.logs.push({ level, message, ...(metadata === undefined ? {} : { metadata }) })
  }

  return new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket', {
    error: record('error'),
    info: record('info'),
    warn: record('warn'),
  })
}

function pointAt(latitude: number, accuracyMeters = '8') {
  return {
    accuracyMeters,
    capturedAt: new Date().toISOString(),
    latitude: latitude.toFixed(7),
    longitude: BASE_LONGITUDE.toFixed(7),
  }
}

function arrive(
  world: World,
  input: {
    readonly accuracyMeters?: string
    readonly key?: string
    readonly latitude: number | null
    readonly stopId?: string
    readonly tappedAt?: Date
  },
) {
  return reportStopArrival({
    ...(input.tappedAt === undefined ? {} : { tappedAt: input.tappedAt }),
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key ?? crypto.randomUUID(),
    location: input.latitude === null ? null : pointAt(input.latitude, input.accuracyMeters),
    now: new Date(),
    stopId: input.stopId ?? world.trip.stopId,
    unitOfWork: unitOfWorkFor(world),
  })
}

async function readAddress(world: World) {
  const [row] = await world.database.db
    .select()
    .from(geocodedAddresses)
    .where(eq(geocodedAddresses.addressKey, world.addressKey))

  return row
}

function readSuggestions(world: World) {
  return world.database.db
    .select()
    .from(addressCorrectionSuggestions)
    .where(eq(addressCorrectionSuggestions.companyId, world.company.companyId))
}

function readCorrections(world: World) {
  return world.database.db
    .select()
    .from(geocodedAddressCorrections)
    .where(eq(geocodedAddressCorrections.companyId, world.company.companyId))
}

describe('o ponto da chegada corrige o endereço (spec 294 T3.1)', () => {
  testWithPostgres(
    'CEP e ponto a 500 m: grava direto como driver, com trilha e evento na linha do tempo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })

        await arrive(world, { latitude: NORTH_500_METRES })

        const address = await readAddress(world)
        expect(address?.source).toBe('driver')
        expect(address?.precision).toBe('street')
        expect(Number(address?.latitude)).toBeCloseTo(NORTH_500_METRES, 6)
        const corrections = await readCorrections(world)
        expect(corrections).toHaveLength(1)
        expect(corrections[0]).toMatchObject({
          actorUserId: world.driverUserId,
          newSource: 'driver',
          origin: 'driver',
          previousSource: 'postal_code',
        })
        expect(await readSuggestions(world)).toEqual([])
        const timeline = await listTripTimeline(database.db, {
          companyId: world.company.companyId,
          cursor: null,
          limit: 50,
          tripId: world.trip.tripId,
        })
        const corrected = timeline.items.find((item) => item.kind === 'stop.address_corrected')
        expect(corrected?.addressChange?.origin).toBe('driver')
        expect(world.logs.map((entry) => entry.message)).toContain('address_correction.applied')
      })
    },
  )

  testWithPostgres('CEP e ponto a 5 km: vira sugestão pendente e o cadastro não muda', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'postal_code' })

      await arrive(world, { latitude: NORTH_5_KILOMETRES })

      expect((await readAddress(world))?.source).toBe('postal_code')
      const suggestions = await readSuggestions(world)
      expect(suggestions).toHaveLength(1)
      expect(suggestions[0]).toMatchObject({
        addressKey: world.addressKey,
        companyId: world.company.companyId,
        createdByUserId: world.driverUserId,
        status: 'pending',
        tripStopId: world.trip.stopId,
      })
      expect(suggestions[0]?.distanceMeters).toBeGreaterThan(4_900)
      expect(await readCorrections(world)).toEqual([])
    })
  })

  testWithPostgres('endereço confiável e ponto a 200 m: nada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'rooftop' })

      await arrive(world, { latitude: NORTH_200_METRES })

      expect((await readAddress(world))?.source).toBe('google')
      expect(await readSuggestions(world)).toEqual([])
      expect(await readCorrections(world)).toEqual([])
      expect(world.logs.map((entry) => entry.message)).toContain('address_correction.ignored')
    })
  })

  testWithPostgres('endereço confiável e ponto a 500 m: sugestão, nunca sobrescreve', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'rooftop' })

      await arrive(world, { latitude: NORTH_500_METRES })

      expect((await readAddress(world))?.source).toBe('google')
      expect(await readSuggestions(world)).toHaveLength(1)
      expect(await readCorrections(world)).toEqual([])
    })
  })

  testWithPostgres('endereço sem coordenada nenhuma: sugestão sem distância', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, null)

      await arrive(world, { latitude: NORTH_200_METRES })

      expect(await readAddress(world)).toBeUndefined()
      const suggestions = await readSuggestions(world)
      expect(suggestions).toHaveLength(1)
      expect(suggestions[0]?.distanceMeters).toBeNull()
    })
  })

  testWithPostgres('chegada sem localização: nada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'postal_code' })

      await arrive(world, { latitude: null })

      expect((await readAddress(world))?.source).toBe('postal_code')
      expect(await readSuggestions(world)).toEqual([])
      expect(world.logs).toEqual([])
    })
  })

  testWithPostgres('chegada do escritório, mesmo com localização: nada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'postal_code' })
      const target = await resolveFieldTripTarget({
        companyId: world.company.companyId,
        repository: new DrizzleFieldTripTargetRepository(database.db),
        target: { kind: 'trip', tripId: world.trip.tripId },
      })

      await reportStopArrival({
        actorUserId: world.company.userId,
        companyId: world.company.companyId,
        idempotencyKey: 'office-arrival',
        location: pointAt(NORTH_500_METRES),
        now: new Date(Date.now() - 60_000),
        stopId: world.trip.stopId,
        target,
        unitOfWork: unitOfWorkFor(world),
      })

      expect((await readAddress(world))?.source).toBe('postal_code')
      expect(await readSuggestions(world)).toEqual([])
      expect(await readCorrections(world)).toEqual([])
    })
  })

  testWithPostgres('chegada marcada junto pela baixa: nada, a localização é nula', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'postal_code' })

      await reportDocumentDelivery({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'together-delivery',
        location: pointAt(NORTH_500_METRES),
        now: new Date(),
        unitOfWork: unitOfWorkFor(world),
      })

      const events = await database.db.select().from(tripStopEvents)
      expect(events.some((event) => event.kind === 'arrived' && event.recordedTogether)).toBe(true)
      expect((await readAddress(world))?.source).toBe('postal_code')
      expect(await readSuggestions(world)).toEqual([])
      expect(await readCorrections(world)).toEqual([])
    })
  })

  testWithPostgres('reenvio com a mesma chave: uma gravação só', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, { precision: 'postal_code' })

      await arrive(world, { key: 'replay', latitude: NORTH_5_KILOMETRES })
      await arrive(world, { key: 'replay', latitude: NORTH_5_KILOMETRES })

      expect(await readSuggestions(world)).toHaveLength(1)
    })
  })

  testWithPostgres(
    'chegada repetida com chave nova: a sugestão é por evento, e o cadastro corrigido não regrava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })

        await arrive(world, { latitude: NORTH_500_METRES })
        await arrive(world, { latitude: NORTH_500_METRES })

        expect(await readCorrections(world)).toHaveLength(1)
        expect(await readSuggestions(world)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'CEP e ponto a 500 m com precisão ruim (> 50 m): sugestão, o cadastro não muda (S3)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })

        await arrive(world, { accuracyMeters: '120', latitude: NORTH_500_METRES })

        expect((await readAddress(world))?.source).toBe('postal_code')
        expect(await readSuggestions(world)).toHaveLength(1)
        expect(await readCorrections(world)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'chegada tardia da fila offline: a chegada grava, sem correção nem sugestão (S3)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })

        const result = await arrive(world, {
          latitude: NORTH_500_METRES,
          tappedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        })

        expect(result.id).toBeString()
        expect((await readAddress(world))?.source).toBe('postal_code')
        expect(await readSuggestions(world)).toEqual([])
        expect(await readCorrections(world)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'ponto gravado pelo motorista se refina com outra chegada precisa (S3)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })
        await arrive(world, { latitude: NORTH_500_METRES })
        await database.db
          .update(tripStops)
          .set({ arrivedAt: null })
          .where(eq(tripStops.id, world.trip.stopId))

        await arrive(world, { latitude: NORTH_500_METRES + 0.0009 })

        const address = await readAddress(world)
        expect(address).toMatchObject({ precision: 'street', source: 'driver' })
        expect(Number(address?.latitude)).toBeCloseTo(NORTH_500_METRES + 0.0009, 6)
        expect(await readCorrections(world)).toHaveLength(2)
      })
    },
  )

  testWithPostgres(
    'duas sugestões do mesmo endereço: a pendente é atualizada, não duplicada (S9)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { precision: 'postal_code' })

        await arrive(world, { latitude: NORTH_5_KILOMETRES })
        await database.db
          .update(tripStops)
          .set({ arrivedAt: null })
          .where(eq(tripStops.id, world.trip.stopId))
        const second = await arrive(world, { latitude: NORTH_5_KILOMETRES + 0.001 })

        const suggestions = await readSuggestions(world)
        expect(suggestions).toHaveLength(1)
        expect(suggestions[0]?.tripStopEventId).toBe(second.id)
        expect(Number(suggestions[0]?.latitude)).toBeCloseTo(NORTH_5_KILOMETRES + 0.001, 6)
      })
    },
  )

  testWithPostgres('falha na correção: a chegada grava e o aviso leva só ids', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, null)
      await database.db.execute(
        sql`alter table address_correction_suggestions rename to address_correction_suggestions_gone`,
      )

      const result = await arrive(world, { latitude: NORTH_200_METRES })

      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.id, result.id))
      expect(events).toHaveLength(1)
      const warning = world.logs.find((entry) => entry.level === 'warn')
      expect(warning?.message).toBe('address_correction.failed')
      expect(JSON.stringify(warning?.metadata)).not.toContain(String(NORTH_200_METRES).slice(0, 6))
      expect(Object.keys(warning?.metadata ?? {}).sort()).toEqual([
        'companyId',
        'eventId',
        'idempotencyKey',
        'stopId',
      ])
    })
  })
})
