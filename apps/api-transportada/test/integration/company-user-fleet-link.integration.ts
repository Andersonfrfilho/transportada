/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O vínculo entre o convite e a ficha de frota é um UPDATE condicional, e as condições é que
 * importam: casar CPF dentro da empresa, não roubar ficha de quem já tem usuário, e não vazar
 * para a empresa vizinha. Nada disso aparece em teste com repositório falso.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  identityUserProfiles,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const ISSUER = 'https://keycloak.test/realms/transportada'
const DRIVER_TAX_ID = '12345678909'

describe('convite de usuário — vínculo com fleet_drivers', () => {
  testWithPostgres('preenche a ficha órfã com o mesmo CPF na mesma empresa', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const driverId = await seedDriver(db, { companyId, membershipId: null })

      const repository = new DrizzleCompanyUserRepository(db)
      const { linkedFleetDriverId, membershipId } = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver'], taxId: DRIVER_TAX_ID }),
      )

      expect(linkedFleetDriverId).toBe(driverId)
      const [driver] = await db
        .select({ membershipId: fleetDrivers.membershipId })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.id, driverId))
      expect(driver?.membershipId).toBe(membershipId)
    })
  })

  /** Ficha já vinculada é de outra pessoa; roubá-la deixaria a primeira sem frota, em silêncio. */
  testWithPostgres('não rouba ficha que já tem usuário', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const repository = new DrizzleCompanyUserRepository(db)

      const first = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver'], taxId: DRIVER_TAX_ID }),
      )
      const driverId = await seedDriver(db, {
        companyId,
        membershipId: first.membershipId,
      })

      const second = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver'], taxId: '98765432100' }),
      )

      expect(second.linkedFleetDriverId).toBeNull()
      const [driver] = await db
        .select({ membershipId: fleetDrivers.membershipId })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.id, driverId))
      expect(driver?.membershipId).toBe(first.membershipId)
    })
  })

  testWithPostgres('não alcança ficha de outra empresa com o mesmo CPF', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      const otherDriverId = await seedDriver(db, {
        companyId: otherCompanyId,
        membershipId: null,
      })

      const repository = new DrizzleCompanyUserRepository(db)
      const { linkedFleetDriverId } = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver'], taxId: DRIVER_TAX_ID }),
      )

      expect(linkedFleetDriverId).toBeNull()
      const [driver] = await db
        .select({ membershipId: fleetDrivers.membershipId })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.id, otherDriverId))
      expect(driver?.membershipId).toBeNull()
    })
  })

  testWithPostgres('papel sem frota não toca em ficha nenhuma', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const driverId = await seedDriver(db, { companyId, membershipId: null })

      const repository = new DrizzleCompanyUserRepository(db)
      const { linkedFleetDriverId } = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['fiscal'], taxId: DRIVER_TAX_ID }),
      )

      expect(linkedFleetDriverId).toBeNull()
      const [driver] = await db
        .select({ membershipId: fleetDrivers.membershipId })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.id, driverId))
      expect(driver?.membershipId).toBeNull()
    })
  })

  /** O índice é parcial: quem não cadastrou CPF não colide com quem também não cadastrou. */
  testWithPostgres('dois perfis sem CPF convivem, e dois com o mesmo CPF não', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const repository = new DrizzleCompanyUserRepository(db)

      await repository.createInvitedUser(buildInvite({ companyId, roles: ['fiscal'], taxId: '' }))
      await repository.createInvitedUser(buildInvite({ companyId, roles: ['fiscal'], taxId: '' }))
      const withoutTaxId = await db
        .select({ userId: identityUserProfiles.userId })
        .from(identityUserProfiles)
        .where(eq(identityUserProfiles.taxId, ''))
      expect(withoutTaxId).toHaveLength(2)

      await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['fiscal'], taxId: DRIVER_TAX_ID }),
      )
      await expect(
        repository.createInvitedUser(
          buildInvite({ companyId, roles: ['fiscal'], taxId: DRIVER_TAX_ID }),
        ),
      ).rejects.toThrow()
    })
  })

  testWithPostgres('o vínculo aparece na membership da empresa que convidou', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const repository = new DrizzleCompanyUserRepository(db)

      const { membershipId } = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['operator'], taxId: '' }),
      )

      const [membership] = await db
        .select({ id: userCompanyMemberships.id })
        .from(userCompanyMemberships)
        .where(
          and(
            eq(userCompanyMemberships.companyId, companyId),
            eq(userCompanyMemberships.id, membershipId),
          ),
        )
      expect(membership?.id).toBe(membershipId)
    })
  })
})

function buildInvite({
  companyId,
  roles,
  taxId,
}: {
  readonly companyId: string
  readonly roles: readonly ('aggregate' | 'driver' | 'fiscal' | 'operator')[]
  readonly taxId: string
}) {
  const userId = crypto.randomUUID()
  return {
    companyId,
    contactAddress: `${userId}@empresa.test`,
    contactChannel: 'email' as const,
    email: `${userId}@empresa.test`,
    issuer: ISSUER,
    name: 'Pessoa Convidada',
    phone: '',
    roles,
    subject: crypto.randomUUID(),
    taxId,
    userId,
    username: userId,
  }
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedDriver(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly membershipId: string | null },
): Promise<string> {
  const driverId = crypto.randomUUID()
  await db.insert(fleetDrivers).values({
    companyId: input.companyId,
    id: driverId,
    membershipId: input.membershipId,
    name: 'Motorista Existente',
    taxId: DRIVER_TAX_ID,
  })
  return driverId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_userlink_${crypto.randomUUID().replaceAll('-', '')}`
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
