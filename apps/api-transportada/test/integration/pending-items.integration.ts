/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetVehicles } from '../../src/database/database.schema.js'
import { createListPendingItemsUseCase } from '../../src/pending-items/application/list-pending-items.use-case.js'
import { createFleetBodyTypePendingItemSource } from '../../src/pending-items/infrastructure/drizzle-fleet-body-type-pending-item.source.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * Spec 147 T14: o truck com `00` some da fila assim que a ficha é corrigida, e nunca aparece para
 * empresa alheia nem em nome do cavalo, que não tem carroceria de verdade.
 */
describe('GET /pending-items lista o cadastro sem carroceria (spec 147 T14)', () => {
  testWithPostgres(
    'o truck 00 aparece, some depois de salvo com 02, e o cavalo 00 nunca aparece',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        const truckId = crypto.randomUUID()
        const tractorId = crypto.randomUUID()
        const otherCompanyVehicleId = crypto.randomUUID()

        await database.db.insert(companies).values([
          { id: companyId, status: 'active' },
          { id: otherCompanyId, status: 'active' },
        ])
        await database.db.insert(fleetVehicles).values([
          {
            bodyType: '00',
            companyId,
            id: truckId,
            plate: 'ABC1D23',
            role: 'traction',
            state: 'SP',
            vehicleType: 'truck',
          },
          {
            bodyType: '00',
            companyId,
            id: tractorId,
            plate: 'RTF7L90',
            role: 'traction',
            state: 'SP',
            vehicleType: 'tractor_unit',
          },
          {
            bodyType: '00',
            companyId: otherCompanyId,
            id: otherCompanyVehicleId,
            plate: 'XYZ9A88',
            role: 'traction',
            state: 'SP',
            vehicleType: 'truck',
          },
        ])

        const useCase = createListPendingItemsUseCase({
          sources: [createFleetBodyTypePendingItemSource({ database: database.db })],
        })

        const beforeFix = await useCase.execute({
          context: { companyId, permissions: new Set(['fleet.read']) },
          cursor: null,
          limit: 25,
        })
        expect(beforeFix.items).toEqual([
          {
            entityId: truckId,
            entityType: 'vehicle',
            kind: 'vehicleBodyTypeMissing',
            label: 'ABC1D23',
          },
        ])

        await database.db
          .update(fleetVehicles)
          .set({ bodyType: '02' })
          .where(eq(fleetVehicles.id, truckId))

        const afterFix = await useCase.execute({
          context: { companyId, permissions: new Set(['fleet.read']) },
          cursor: null,
          limit: 25,
        })
        expect(afterFix.items).toEqual([])

        const withoutPermission = await useCase.execute({
          context: { companyId, permissions: new Set() },
          cursor: null,
          limit: 25,
        })
        expect(withoutPermission).toEqual({ items: [], nextCursor: null })
      })
    },
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t147t14',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
