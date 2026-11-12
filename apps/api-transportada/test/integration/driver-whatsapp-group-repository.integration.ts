/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  FleetDriverNotFoundError,
  FleetDriverWhatsappGroupTakenError,
} from '../../src/fleet/domain/fleet.error.js'
import { DrizzleDriverWhatsappGroupRepository } from '../../src/fleet/infrastructure/drizzle-driver-whatsapp-group.repository.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { DRIVER_FIELDS } from '../fixtures/fleet-http-payload.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const GROUP_A = '120363000000000001@g.us'
const GROUP_B = '120363000000000002@g.us'
const ACTOR = '00000000-0000-4000-8000-0000000000a1'

describe('grupo de WhatsApp do motorista, repositório (spec 292 T1)', () => {
  testWithPostgres(
    '1 para 1: troca o grupo da ficha e recusa o grupo de outro motorista',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, first, groups, second } = await setUp(database)
        const actor = (driverId: string) => ({
          actorUserId: ACTOR,
          companyId,
          correlationId: 'c1',
          driverId,
        })

        expect(await groups.find({ companyId, driverId: first })).toBeNull()
        const saved = await groups.set({
          ...actor(first),
          groupJid: GROUP_A,
          groupName: 'Motorista João',
        })
        expect(saved.groupJid).toBe(GROUP_A)

        // mesmo motorista pode trocar de grupo e repetir o mesmo grupo
        await groups.set({ ...actor(first), groupJid: GROUP_A, groupName: 'Renomeado' })
        expect((await groups.find({ companyId, driverId: first }))?.groupName).toBe('Renomeado')

        // outro motorista não pode ficar com o mesmo grupo
        await expect(
          groups.set({ ...actor(second), groupJid: GROUP_A, groupName: 'x' }),
        ).rejects.toBeInstanceOf(FleetDriverWhatsappGroupTakenError)
        expect(await groups.find({ companyId, driverId: second })).toBeNull()

        // trocar libera o grupo antigo
        await groups.set({ ...actor(first), groupJid: GROUP_B, groupName: 'Outro' })
        await groups.set({ ...actor(second), groupJid: GROUP_A, groupName: 'Agora livre' })
        expect(
          (await groups.listAssignments({ companyId }))
            .map((row) => [row.driverId, row.groupJid])
            .sort(),
        ).toEqual(
          [
            [first, GROUP_B],
            [second, GROUP_A],
          ].sort(),
        )

        // remover é idempotente
        expect(await groups.remove(actor(first))).toBe(true)
        expect(await groups.remove(actor(first))).toBe(false)
      })
    },
  )

  testWithPostgres(
    'duas fichas disputando o mesmo grupo: só uma fica, a outra recebe 409',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, first, groups, second } = await setUp(database)
        const attempt = (driverId: string) =>
          groups
            .set({
              actorUserId: ACTOR,
              companyId,
              correlationId: 'c',
              driverId,
              groupJid: GROUP_A,
              groupName: '',
            })
            .then(() => 'ok' as const)
            .catch((error: unknown) =>
              error instanceof FleetDriverWhatsappGroupTakenError
                ? ('taken' as const)
                : Promise.reject(error),
            )

        const results = await Promise.all([attempt(first), attempt(second)])

        expect(results.sort()).toEqual(['ok', 'taken'])
      })
    },
  )

  testWithPostgres(
    'ficha de outra empresa ou inexistente é 404 e o grupo é isolado por empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { first, groups } = await setUp(database)
        const otherCompany = crypto.randomUUID()
        await database.db.insert(companies).values({ id: otherCompany, status: 'active' })

        await expect(
          groups.set({
            actorUserId: ACTOR,
            companyId: otherCompany,
            correlationId: 'c',
            driverId: first,
            groupJid: GROUP_A,
            groupName: '',
          }),
        ).rejects.toBeInstanceOf(FleetDriverNotFoundError)
        expect(await groups.listAssignments({ companyId: otherCompany })).toEqual([])
      })
    },
  )

  testWithPostgres(
    'spec 292 T3: a lista de permissão do webhook acha o motorista pelo grupo, só na empresa dele',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, first, groups } = await setUp(database)
        const otherCompany = crypto.randomUUID()
        await database.db.insert(companies).values({ id: otherCompany, status: 'active' })

        expect(await groups.findDriverByGroup({ companyId, groupJid: GROUP_A })).toBeNull()
        await groups.set({
          actorUserId: ACTOR,
          companyId,
          correlationId: 'c',
          driverId: first,
          groupJid: GROUP_A,
          groupName: '',
        })

        expect(await groups.findDriverByGroup({ companyId, groupJid: GROUP_A })).toEqual({
          driverId: first,
        })
        expect(await groups.findDriverByGroup({ companyId, groupJid: GROUP_B })).toBeNull()
        expect(
          await groups.findDriverByGroup({ companyId: otherCompany, groupJid: GROUP_A }),
        ).toBeNull()
      })
    },
  )

  testWithPostgres(
    'o banco recusa identificador que não é de grupo e apagar a ficha apaga o vínculo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, first, groups } = await setUp(database)

        await expect(
          (async () => {
            await database.db.execute(
              sql`insert into fleet_driver_whatsapp_groups (company_id, driver_id, group_jid) values (${companyId}, ${first}, '5516@s.whatsapp.net')`,
            )
          })(),
        ).rejects.toThrow()

        await groups.set({
          actorUserId: ACTOR,
          companyId,
          correlationId: 'c',
          driverId: first,
          groupJid: GROUP_A,
          groupName: '',
        })
        await database.db.execute(sql`delete from fleet_drivers where id = ${first}`)
        expect(await groups.listAssignments({ companyId })).toEqual([])
      })
    },
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function setUp(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: ACTOR, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: ACTOR,
  })
  const drivers = new DrizzleFleetDriverRepository(database.db)
  const first = await drivers.create({
    canDrive: true,
    companyId,
    driver: {
      ...DRIVER_FIELDS,
      membershipId: null,
      taxId: '11111111111',
      licenseNumber: '11111111111',
    },
  })
  const second = await drivers.create({
    canDrive: true,
    companyId,
    driver: {
      ...DRIVER_FIELDS,
      membershipId: null,
      taxId: '22222222222',
      licenseNumber: '22222222222',
    },
  })
  return {
    companyId,
    first: first.id,
    groups: new DrizzleDriverWhatsappGroupRepository(database.db),
    second: second.id,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t292',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
