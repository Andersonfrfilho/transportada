/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetVehicles, trips } from '../../src/database/database.schema.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { readCargoPreviewContext } from '../../src/trips/infrastructure/trip-cargo-preview.query.js'
import { loadTripOccupancy } from '../../src/trips/infrastructure/trip-occupancy.support.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * Spec 147 T18 (segunda revisão): quem carrega — a carreta quando existe, senão o cavalo — decide
 * o teto de peso, o acesso de carga e se a carreta padrão entra na conta. Os três pontos abaixo
 * fecham os achados 5, 12 e 12b da revisão, que a primeira rodada de T18 tinha resolvido no código
 * mas não tinha coberto de teste.
 */
describe('quem carrega decide o teto de peso e o acesso de carga (spec 147 T18)', () => {
  testWithPostgres(
    'loadTripOccupancy reads maxPayloadKg and loadingAccess from the trailer, not the tractor',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const tractorId = crypto.randomUUID()
        const trailerId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(fleetVehicles).values([
          {
            capacityKg: '10000',
            companyId,
            id: tractorId,
            loadingAccess: 'rear',
            plate: 'RTM7N89',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            capacityKg: '27000',
            companyId,
            id: trailerId,
            loadingAccess: 'open',
            plate: 'RTN8P90',
            role: 'trailer',
            state: 'SP',
            vehicleType: '',
          },
        ])

        const withoutTrailer = await loadTripOccupancy(database.db, {
          companyId,
          nfeDocumentIds: [],
          trailerVehicleId: null,
          vehicleId: tractorId,
        })
        expect(withoutTrailer.maxPayloadKg).toBe('10000.00')
        expect(withoutTrailer.loadingAccess).toBe('rear')

        const withTrailer = await loadTripOccupancy(database.db, {
          companyId,
          nfeDocumentIds: [],
          trailerVehicleId: trailerId,
          vehicleId: tractorId,
        })
        expect(withTrailer.maxPayloadKg).toBe('27000.00')
        expect(withTrailer.loadingAccess).toBe('open')
      })
    },
  )

  /**
   * Achado da segunda revisão: `fleet_vehicles.capacity_kg` é `NOT NULL` com `default('0')`
   * (`fleet.schema.ts`) — "sem teto" nunca chega como `null` no nível de `loadTripOccupancy`, só
   * como zero cru. A decisão original do T18 ("carreta sem teto → `maxPayloadKg` nulo") só se
   * cumpre uma camada acima, em `resolvePayloadCeiling`/`parseCeiling`
   * (`trip-cargo-weight.policy.ts`), onde zero e nulo já são tratados como a mesma ausência. Este
   * teste prova o que a função **aqui** garante de fato: o zero é da carreta, não um fallback que
   * escapou para o teto do cavalo.
   */
  testWithPostgres(
    'a trailer without a known payload ceiling never inherits the tractor ceiling',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const tractorId = crypto.randomUUID()
        const trailerId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(fleetVehicles).values([
          {
            capacityKg: '10000',
            companyId,
            id: tractorId,
            plate: 'RTO9Q01',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            // capacityKg omitido: fica no default da coluna, '0.00' — nunca null.
            companyId,
            id: trailerId,
            plate: 'RTP0R12',
            role: 'trailer',
            state: 'SP',
            vehicleType: '',
          },
        ])

        const result = await loadTripOccupancy(database.db, {
          companyId,
          nfeDocumentIds: [],
          trailerVehicleId: trailerId,
          vehicleId: tractorId,
        })

        // O default da coluna (`'0'`) chega cru, sem o zero-padding de escala que um valor
        // explicitamente inserido (`'10000'` → `'10000.00'`) ganha — mais um sintoma de que "sem
        // teto" não é uma forma canônica única neste nível.
        expect(result.maxPayloadKg).toBe('0')
        expect(result.maxPayloadKg).not.toBe('10000.00')
      })
    },
  )

  testWithPostgres(
    'readCargoPreviewContext only borrows the default trailer when it is a free active trailer of this company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const tractorId = crypto.randomUUID()
        const otherTractorId = crypto.randomUUID()
        const trailerId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(fleetVehicles).values([
          {
            companyId,
            defaultTrailerVehicleId: trailerId,
            id: tractorId,
            loadingAccess: 'rear',
            plate: 'RTQ1S23',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            companyId,
            id: otherTractorId,
            loadingAccess: 'rear',
            plate: 'RTR2T34',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            companyId,
            id: trailerId,
            loadingAccess: 'open',
            plate: 'RTS3U45',
            role: 'trailer',
            state: 'SP',
            vehicleType: '',
          },
        ])

        // Padrão elegível: ativa, papel de carreta, livre — a prévia considera a carreta, e o motivo
        // da capacidade desconhecida (sem ficha de carroceria) aponta para ela, não para o cavalo.
        const eligible = await readCargoPreviewContext(database.db, {
          companyId,
          driverIds: [],
          nfeDocumentIds: [],
          vehicleId: tractorId,
        })
        expect(eligible.loadingAccess).toBe('open')
        expect(eligible.capacityUnknownReason).toBe('bodyTypeMissing')
        expect(eligible.capacityUnknownVehicleId).toBe(trailerId)

        // Padrão inativa: a prévia nasce sem carreta, e o motivo volta a apontar para o cavalo.
        await database.db
          .update(fleetVehicles)
          .set({ status: 'inactive' })
          .where(eq(fleetVehicles.id, trailerId))
        const inactive = await readCargoPreviewContext(database.db, {
          companyId,
          driverIds: [],
          nfeDocumentIds: [],
          vehicleId: tractorId,
        })
        expect(inactive.loadingAccess).toBe('rear')
        expect(inactive.capacityUnknownReason).toBe('trailerMissing')
        expect(inactive.capacityUnknownVehicleId).toBe(tractorId)

        // Papel diferente de carreta: só alcançável escrevendo direto no banco — a rota de frota
        // nunca aceita um cavalo como carreta padrão de outro cavalo.
        await database.db
          .update(fleetVehicles)
          .set({ role: 'traction', status: 'active', vehicleType: 'truck' })
          .where(eq(fleetVehicles.id, trailerId))
        const wrongRole = await readCargoPreviewContext(database.db, {
          companyId,
          driverIds: [],
          nfeDocumentIds: [],
          vehicleId: tractorId,
        })
        expect(wrongRole.loadingAccess).toBe('rear')
        expect(wrongRole.capacityUnknownReason).toBe('trailerMissing')

        // Carreta ativa e de papel certo outra vez, mas presa numa viagem aberta de outro cavalo.
        await database.db
          .update(fleetVehicles)
          .set({ role: 'trailer', vehicleType: '' })
          .where(eq(fleetVehicles.id, trailerId))
        await database.db.insert(trips).values({
          companyId,
          id: crypto.randomUUID(),
          status: 'draft',
          trailerVehicleId: trailerId,
          vehicleId: otherTractorId,
        })
        const busy = await readCargoPreviewContext(database.db, {
          companyId,
          driverIds: [],
          nfeDocumentIds: [],
          vehicleId: tractorId,
        })
        expect(busy.loadingAccess).toBe('rear')
        expect(busy.capacityUnknownReason).toBe('trailerMissing')
      })
    },
  )

  testWithPostgres(
    'creating a trip never inherits a default trailer whose role turned into traction',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const tractorId = crypto.randomUUID()
        const formerTrailerId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(fleetVehicles).values([
          {
            companyId,
            defaultTrailerVehicleId: formerTrailerId,
            id: tractorId,
            plate: 'RTT4V56',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            companyId,
            id: formerTrailerId,
            plate: 'RTU5W67',
            role: 'trailer',
            state: 'SP',
            vehicleType: '',
          },
        ])

        // Só alcançável escrevendo direto no banco: a rota de frota nunca aceita um cavalo como
        // carreta padrão, e a validação da rota de viagem nem toca neste campo — ele é resolvido
        // internamente por `resolveDefaultTrailerForCreation`.
        await database.db
          .update(fleetVehicles)
          .set({ role: 'traction', vehicleType: 'truck' })
          .where(eq(fleetVehicles.id, formerTrailerId))

        const repository = new DrizzleTripRepository(database.db)
        const useCase = createTripUseCase({
          locations: { purgeByTrip: async () => {} },
          repository,
        })

        const trip = await useCase.create({
          context: { companyId, userId: crypto.randomUUID() },
          driverIds: [],
          vehicleId: tractorId,
        })

        expect(trip.trailer).toBeNull()
      })
    },
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t147carrier_${crypto.randomUUID().replaceAll('-', '')}`
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
