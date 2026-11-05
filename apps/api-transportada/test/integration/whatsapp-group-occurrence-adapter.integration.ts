/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T5: a ocorrência pedida no grupo fica no nome do motorista dono do grupo. O autor é a conta
 * dele (vínculo ativo da ficha); sem conta, o grupo recusa com frase clara e nada é registrado.
 */
import { describe, expect, test } from 'bun:test'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import {
  createGroupOccurrencePorts,
  GROUP_OCCURRENCE_REFUSAL,
} from '../../src/whatsapp/infrastructure/whatsapp-group-occurrence.adapter.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { DRIVER_FIELDS } from '../fixtures/fleet-http-payload.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('pedido no grupo: autor da ocorrência (spec 292 T5)', () => {
  testWithPostgres(
    'com conta ativa registra como o motorista; sem conta, ou com vínculo inativo, recusa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const membershipId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await database.db
          .insert(userCompanyMemberships)
          .values({ companyId, id: membershipId, status: 'active', userId })
        const drivers = new DrizzleFleetDriverRepository(database.db)
        const withAccount = await drivers.create({
          canDrive: true,
          companyId,
          driver: {
            ...DRIVER_FIELDS,
            licenseNumber: '11111111111',
            membershipId,
            taxId: '11111111111',
          },
        })
        const withoutAccount = await drivers.create({
          canDrive: true,
          companyId,
          driver: {
            ...DRIVER_FIELDS,
            licenseNumber: '22222222222',
            membershipId: null,
            taxId: '22222222222',
          },
        })

        const calls: { actorUserId: string; driverId: string }[] = []
        const ports = createGroupOccurrencePorts({
          database: database.db,
          listActiveTrips: async () => [],
          registerOccurrence: async (input) => {
            calls.push({ actorUserId: input.actorUserId, driverId: input.driverId })
            return {} as never
          },
        })
        const register = (driverId: string) =>
          ports.register({
            companyId,
            documentId: crypto.randomUUID(),
            documentNumber: '1',
            driverId,
            idempotencyKey: 'k',
            note: '',
            occurrenceTypeId: crypto.randomUUID(),
          })

        expect(await register(withAccount.id)).toEqual({
          kind: 'registered',
          summary: {
            clientName: '',
            contractorName: '',
            registeredAt: expect.any(String),
            series: '',
          },
        })
        expect(calls).toEqual([{ actorUserId: userId, driverId: withAccount.id }])

        expect(await register(withoutAccount.id)).toEqual({
          kind: 'refused',
          message: GROUP_OCCURRENCE_REFUSAL.noAccess,
          retry: null,
        })
        await database.db.execute(
          `update user_company_memberships set status = 'disabled' where id = '${membershipId}'`,
        )
        expect(await register(withAccount.id)).toMatchObject({ kind: 'refused' })
        expect(calls).toHaveLength(1)
      })
    },
  )
})

type TestDatabase = ReturnType<typeof createDatabaseProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t292o',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 2, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
