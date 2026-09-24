/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T8d: o detalhe da viagem (`readTripDetail`) passa a trazer `closedAt`/`closeReason` e o
 * nome de quem encerrou, resolvido por membership escopada pela empresa — o mesmo molde da junção
 * de ator da linha do tempo (`trip-timeline-status.query.ts`). Os três só existem no encerramento
 * **manual** pelo botão; a derivação automática que também leva `status` a `completed` nunca os
 * preenche.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { SQL } from 'bun'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUserProfiles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips } from '../../src/database/trip.schema.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type SeededTrip = {
  readonly closerUserId: string
  readonly companyId: string
  readonly tripId: string
}

describe('o detalhe da viagem traz quem encerrou, quando e por quê (spec 156 T8d)', () => {
  testWithPostgres(
    'viagem encerrada à mão traz closedAt, closeReason e o nome de quem encerrou',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'in_transit' })
        const repository = new DrizzleTripRepository(database.db)

        await repository.close({
          actorUserId: seed.closerUserId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          closeReason: 'Canhotos recebidos no escritório',
          companyId: seed.companyId,
          correlationId: crypto.randomUUID(),
          ipAddress: '127.0.0.1',
          onBehalfOfDriverId: null,
          tripId: seed.tripId,
        })

        const detail = await repository.findById({
          companyId: seed.companyId,
          tripId: seed.tripId,
        })

        expect(detail?.status).toBe('completed')
        expect(detail?.closeReason).toBe('Canhotos recebidos no escritório')
        expect(detail?.closedByName).toBe('Encerradora do Escritório')
        expect(typeof detail?.closedAt).toBe('string')
        expect(Number.isNaN(new Date(detail?.closedAt ?? '').getTime())).toBe(false)
      })
    },
  )

  testWithPostgres(
    'quem encerrou sem membership ativa (removida) aparece sem nome, sem lançar',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'in_transit' })
        const repository = new DrizzleTripRepository(database.db)

        await repository.close({
          actorUserId: seed.closerUserId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          closeReason: null,
          companyId: seed.companyId,
          correlationId: crypto.randomUUID(),
          ipAddress: '127.0.0.1',
          onBehalfOfDriverId: null,
          tripId: seed.tripId,
        })

        // A pessoa foi removida da empresa depois de encerrar a viagem.
        await database.db
          .update(userCompanyMemberships)
          .set({ status: 'disabled' })
          .where(eq(userCompanyMemberships.userId, seed.closerUserId))

        const detail = await repository.findById({
          companyId: seed.companyId,
          tripId: seed.tripId,
        })

        expect(detail?.closedByName).toBeNull()
        expect(typeof detail?.closedAt).toBe('string')
      })
    },
  )

  testWithPostgres('viagem concluída pela derivação automática traz os três nulos', async () => {
    await withDisposableDatabase(async (database) => {
      const seed = await seedTrip(database, { status: 'in_transit' })
      const repository = new DrizzleTripRepository(database.db)

      // A derivação automática (`deriveTripStatus`) leva `status` a `completed` sem passar por
      // `close` — nunca toca `closed_at`/`closed_by_user_id`/`close_reason`.
      await database.db.update(trips).set({ status: 'completed' }).where(eq(trips.id, seed.tripId))

      const detail = await repository.findById({
        companyId: seed.companyId,
        tripId: seed.tripId,
      })

      expect(detail?.status).toBe('completed')
      expect(detail?.closedAt).toBeNull()
      expect(detail?.closeReason).toBeNull()
      expect(detail?.closedByName).toBeNull()
    })
  })
})

async function seedTrip(
  database: TestDatabase,
  input: { readonly status: 'draft' | 'in_transit' },
): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const closerUserId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const tripId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: closerUserId, status: 'active' })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: 'encerradora@example.com',
    contactChannel: 'email',
    name: 'Encerradora do Escritório',
    userId: closerUserId,
    username: `encerradora.${closerUserId.slice(0, 8)}`,
  })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: closerUserId,
  })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista da viagem',
    taxId: '11111111111',
  })
  await database.db.insert(trips).values({
    companyId,
    id: tripId,
    status: input.status,
    vehicleId,
  })

  return { closerUserId, companyId, tripId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t156t8d_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
