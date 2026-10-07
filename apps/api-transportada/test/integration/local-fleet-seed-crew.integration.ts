/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetDrivers } from '../../src/database/database.schema.js'
import { LOCAL_FLEET_DRIVER_SEEDS } from '../../src/database/local-fleet-seed.constant.js'
import { seedLocalFleetDrivers } from '../../src/database/local-fleet-seed.service.js'
import { createFleetDriversUseCase } from '../../src/fleet/application/fleet-drivers.use-case.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const ISSUER = 'https://keycloak.test/realms/transportada'

/**
 * Spec 235 T7: a semente passa pelo caso de uso **de verdade** — só o convite do Keycloak é trocado
 * por quem abre o usuário no banco —, então as colunas que a política de viagem lê saem da tradução
 * perfil → colunas, e não de um `INSERT` escrito à mão.
 */
describe('semente local da frota contra Postgres (spec 235)', () => {
  testWithPostgres(
    'grava o ajudante puro e o motorista que ajuda pelas colunas do perfil',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = crypto.randomUUID()
        await db.insert(companies).values({ id: companyId, status: 'active' })
        const users = new DrizzleCompanyUserRepository(db)
        const useCase = createFleetDriversUseCase({
          account: {
            async execute(input) {
              const userId = crypto.randomUUID()
              const { membershipId } = await users.createInvitedUser({
                companyId: input.context.companyId,
                contactAddress: input.contact,
                contactChannel: input.channel,
                email: input.channel === 'email' ? input.contact : '',
                issuer: ISSUER,
                name: input.name,
                phone: input.channel === 'whatsapp' ? input.contact : '',
                roles: input.roles,
                subject: crypto.randomUUID(),
                taxId: '',
                userId,
                username: userId,
              })
              return { membershipId }
            },
          },
          contacts: { isEmailTaken: async () => false },
          repository: new DrizzleFleetDriverRepository(db),
        })
        const context = { companyId, userId: crypto.randomUUID() }

        const first = await seedLocalFleetDrivers({ context, correlationId: 'seed', useCase })
        const second = await seedLocalFleetDrivers({ context, correlationId: 'seed', useCase })

        expect(first).toEqual({ created: LOCAL_FLEET_DRIVER_SEEDS.length, skipped: 0 })
        expect(second).toEqual({ created: 0, skipped: LOCAL_FLEET_DRIVER_SEEDS.length })
        const rows = await db
          .select({
            canActAsHelper: fleetDrivers.canActAsHelper,
            canDrive: fleetDrivers.canDrive,
            licenseNumber: fleetDrivers.licenseNumber,
            taxId: fleetDrivers.taxId,
          })
          .from(fleetDrivers)
          .where(eq(fleetDrivers.companyId, companyId))
        const byTaxId = new Map(rows.map((row) => [row.taxId, row]))

        for (const seed of LOCAL_FLEET_DRIVER_SEEDS) {
          const row = byTaxId.get(seed.driver.taxId)
          expect(row?.canDrive).toBe(seed.profile !== 'helper')
          expect(row?.canActAsHelper).toBe(seed.profile === 'helper' || seed.driver.canActAsHelper)
          if (seed.profile === 'helper') expect(row?.licenseNumber).toBe('')
        }
        expect(rows.filter((row) => row.canActAsHelper && !row.canDrive)).toHaveLength(1)
        expect(rows.filter((row) => row.canActAsHelper && row.canDrive)).toHaveLength(1)
      })
    },
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t234',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
