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
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import type { CompanyRole } from '../../src/database/identity.schema.js'
import { FleetDriverProfileEmptyError } from '../../src/fleet/domain/fleet.error.js'
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

  // Spec 235 D2/D8: o ajudante convidado casa a ficha órfã e ela passa a refletir o perfil
  testWithPostgres('convidar um ajudante deixa a ficha órfã só ajudando', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const driverId = await seedDriver(db, { companyId, membershipId: null })

      const repository = new DrizzleCompanyUserRepository(db)
      const { linkedFleetDriverId, membershipId } = await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['helper'], taxId: DRIVER_TAX_ID }),
      )

      expect(linkedFleetDriverId).toBe(driverId)
      expect(await readCrewCapabilities(db, driverId)).toEqual({
        canActAsHelper: true,
        canDrive: false,
        version: 2n,
      })
      const [driver] = await db
        .select({ membershipId: fleetDrivers.membershipId })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.id, driverId))
      expect(driver?.membershipId).toBe(membershipId)
    })
  })

  testWithPostgres('helper com motorista mantém a ficha dirigindo e liga o ajudar', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const driverId = await seedDriver(db, { companyId, membershipId: null })

      const repository = new DrizzleCompanyUserRepository(db)
      await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver', 'helper'], taxId: DRIVER_TAX_ID }),
      )

      expect(await readCrewCapabilities(db, driverId)).toEqual({
        canActAsHelper: true,
        canDrive: true,
        version: 2n,
      })
    })
  })

  testWithPostgres('convidar motorista não mexe nas colunas nem na versão', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const driverId = await seedDriver(db, { companyId, membershipId: null })

      const repository = new DrizzleCompanyUserRepository(db)
      await repository.createInvitedUser(
        buildInvite({ companyId, roles: ['driver'], taxId: DRIVER_TAX_ID }),
      )

      expect(await readCrewCapabilities(db, driverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 1n,
      })
    })
  })

  testWithPostgres(
    'ajudante convidado não altera ficha vinculada nem de outra empresa',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const otherCompanyId = await seedCompany(db)
        const first = await new DrizzleCompanyUserRepository(db).createInvitedUser(
          buildInvite({ companyId, roles: ['driver'], taxId: '' }),
        )
        const linkedDriverId = await seedDriver(db, { companyId, membershipId: first.membershipId })
        const otherDriverId = await seedDriver(db, {
          companyId: otherCompanyId,
          membershipId: null,
        })

        const { linkedFleetDriverId } = await new DrizzleCompanyUserRepository(
          db,
        ).createInvitedUser(buildInvite({ companyId, roles: ['helper'], taxId: DRIVER_TAX_ID }))

        expect(linkedFleetDriverId).toBeNull()
        for (const driverId of [linkedDriverId, otherDriverId]) {
          expect(await readCrewCapabilities(db, driverId)).toEqual({
            canActAsHelper: false,
            canDrive: true,
            version: 1n,
          })
        }
      })
    },
  )

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

/**
 * Spec 235 D4: trocar os papéis de quem tem ficha de frota reconcilia `can_drive` e
 * `can_act_as_helper` na mesma transação, e só quando a troca toca `driver`, `aggregate` ou `helper`.
 */
describe('troca de papéis — reconciliação com a ficha de frota', () => {
  testWithPostgres('dar fiscal a um motorista não mexe na ficha', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver'],
      })

      await member.repository.replaceRoles({
        companyId,
        roles: ['driver', 'fiscal'],
        userId: member.userId,
      })

      expect(await readRoles(db, member.membershipId)).toEqual(['driver', 'fiscal'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 1n,
      })
    })
  })

  testWithPostgres('helper entrou liga can_act_as_helper e incrementa a versão', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver'],
      })

      await member.repository.replaceRoles({
        companyId,
        roles: ['driver', 'helper'],
        userId: member.userId,
      })

      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: true,
        canDrive: true,
        version: 2n,
      })
    })
  })

  testWithPostgres('helper saiu de quem dirige desliga só can_act_as_helper', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: true,
        canDrive: true,
        companyId,
        roles: ['driver', 'helper'],
      })

      await member.repository.replaceRoles({ companyId, roles: ['driver'], userId: member.userId })

      expect(await readRoles(db, member.membershipId)).toEqual(['driver'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 2n,
      })
    })
  })

  testWithPostgres('helper saiu de quem só ajuda: 409 e nada muda, nem os papéis', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: true,
        canDrive: false,
        companyId,
        roles: ['helper'],
      })

      const refusal = await member.repository
        .replaceRoles({ companyId, roles: ['operator'], userId: member.userId })
        .then(
          () => undefined,
          (error: unknown) => error,
        )

      expect(refusal).toBeInstanceOf(FleetDriverProfileEmptyError)
      expect(await readRoles(db, member.membershipId)).toEqual(['helper'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: true,
        canDrive: false,
        version: 1n,
      })
    })
  })

  testWithPostgres('driver entrou num ajudante puro liga can_drive', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: true,
        canDrive: false,
        companyId,
        roles: ['helper'],
      })

      await member.repository.replaceRoles({
        companyId,
        roles: ['helper', 'driver'],
        userId: member.userId,
      })

      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: true,
        canDrive: true,
        version: 2n,
      })
    })
  })

  testWithPostgres('driver e aggregate saíram de quem não ajuda: 409 e nada muda', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver', 'aggregate'],
      })

      const refusal = await member.repository
        .replaceRoles({ companyId, roles: ['fiscal'], userId: member.userId })
        .then(
          () => undefined,
          (error: unknown) => error,
        )

      expect(refusal).toBeInstanceOf(FleetDriverProfileEmptyError)
      expect(await readRoles(db, member.membershipId)).toEqual(['aggregate', 'driver'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 1n,
      })
    })
  })

  testWithPostgres('a ficha da mesma pessoa em outra empresa fica intocada', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver'],
      })
      const [otherMembership] = await db
        .insert(userCompanyMemberships)
        .values({ companyId: otherCompanyId, status: 'active', userId: member.userId })
        .returning({ id: userCompanyMemberships.id })
      if (otherMembership === undefined) throw new Error('membership da outra empresa')
      const otherDriverId = await seedDriver(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId: otherCompanyId,
        membershipId: otherMembership.id,
      })

      await member.repository.replaceRoles({
        companyId,
        roles: ['driver', 'helper'],
        userId: member.userId,
      })

      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: true,
        canDrive: true,
        version: 2n,
      })
      expect(await readCrewCapabilities(db, otherDriverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 1n,
      })
    })
  })

  /** A ficha é gravada antes dos papéis: se a gravação dos papéis falha, a ficha volta junto. */
  testWithPostgres('falha ao gravar os papéis desfaz também a ficha', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver'],
      })
      const roleOutsideTheCatalog = 'not-a-role' as CompanyRole

      const failure = await member.repository
        .replaceRoles({
          companyId,
          roles: ['driver', 'helper', roleOutsideTheCatalog],
          userId: member.userId,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        )

      expect(failure).toBeInstanceOf(Error)
      expect(await readRoles(db, member.membershipId)).toEqual(['driver'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: false,
        canDrive: true,
        version: 1n,
      })
    })
  })

  testWithPostgres('pessoa sem ficha troca de papel sem reconciliar nada', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const repository = new DrizzleCompanyUserRepository(db)
      const invite = buildInvite({ companyId, roles: ['helper'], taxId: '' })
      const { membershipId } = await repository.createInvitedUser(invite)

      await repository.replaceRoles({ companyId, roles: ['operator'], userId: invite.userId })

      expect(await readRoles(db, membershipId)).toEqual(['operator'])
    })
  })

  /**
   * A ficha é lida travada: quem liga o switch numa transação concorrente é esperado, e a troca
   * decide sobre o valor gravado por ela — sem a trava, leria o antigo e recusaria com 409.
   */
  testWithPostgres('espera a ficha travada e decide sobre o valor já gravado', async () => {
    await withDisposableDatabase(async ({ db }, url) => {
      const companyId = await seedCompany(db)
      const member = await seedCrewMember(db, {
        canActAsHelper: false,
        canDrive: true,
        companyId,
        roles: ['driver'],
      })
      const locker = new SQL(url, { max: 1 })
      let releaseLock: () => void = () => undefined
      try {
        let signalLockHeld: () => void = () => undefined
        const lockHeld = new Promise<void>((resolve) => {
          signalLockHeld = resolve
        })
        const lockReleased = new Promise<void>((resolve) => {
          releaseLock = resolve
        })
        const holder = locker.begin(async (transaction) => {
          await transaction`select id from fleet_drivers where id = ${member.driverId} for update`
          signalLockHeld()
          await lockReleased
          await transaction`update fleet_drivers set can_act_as_helper = true, version = version + 1 where id = ${member.driverId}`
        })
        await lockHeld

        let isSettled = false
        const replacing = member.repository
          .replaceRoles({ companyId, roles: ['operator'], userId: member.userId })
          .then(
            () => 'resolved',
            (error: unknown) => error,
          )
          .finally(() => {
            isSettled = true
          })
        await Bun.sleep(300)
        expect(isSettled).toBe(false)

        releaseLock()
        await holder
        expect(await replacing).toBe('resolved')
      } finally {
        releaseLock()
        await locker.close({ timeout: 5 })
      }

      expect(await readRoles(db, member.membershipId)).toEqual(['operator'])
      expect(await readCrewCapabilities(db, member.driverId)).toEqual({
        canActAsHelper: true,
        canDrive: false,
        version: 3n,
      })
    })
  })
})

function buildInvite({
  companyId,
  roles,
  taxId,
}: {
  readonly companyId: string
  readonly roles: readonly CompanyRole[]
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
  input: {
    readonly canActAsHelper?: boolean
    readonly canDrive?: boolean
    readonly companyId: string
    readonly membershipId: string | null
  },
): Promise<string> {
  const driverId = crypto.randomUUID()
  await db.insert(fleetDrivers).values({
    canActAsHelper: input.canActAsHelper ?? false,
    canDrive: input.canDrive ?? true,
    companyId: input.companyId,
    id: driverId,
    membershipId: input.membershipId,
    name: 'Motorista Existente',
    taxId: DRIVER_TAX_ID,
  })
  return driverId
}

/** Pessoa convidada com os papéis pedidos e a ficha já vinculada ao vínculo dela. */
async function seedCrewMember(
  db: TestDatabase['db'],
  input: {
    readonly canActAsHelper: boolean
    readonly canDrive: boolean
    readonly companyId: string
    readonly roles: readonly CompanyRole[]
  },
) {
  const repository = new DrizzleCompanyUserRepository(db)
  const invite = buildInvite({ companyId: input.companyId, roles: input.roles, taxId: '' })
  const { membershipId } = await repository.createInvitedUser(invite)
  const driverId = await seedDriver(db, {
    canActAsHelper: input.canActAsHelper,
    canDrive: input.canDrive,
    companyId: input.companyId,
    membershipId,
  })
  return { driverId, membershipId, repository, userId: invite.userId }
}

async function readCrewCapabilities(db: TestDatabase['db'], driverId: string) {
  const [driver] = await db
    .select({
      canActAsHelper: fleetDrivers.canActAsHelper,
      canDrive: fleetDrivers.canDrive,
      version: fleetDrivers.version,
    })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.id, driverId))
  return driver
}

async function readRoles(db: TestDatabase['db'], membershipId: string): Promise<CompanyRole[]> {
  const rows = await db
    .select({ role: membershipRoles.role })
    .from(membershipRoles)
    .where(eq(membershipRoles.membershipId, membershipId))
  return rows.map((row) => row.role).sort()
}

async function withDisposableDatabase(
  operation: (database: TestDatabase, url: string) => Promise<void>,
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
    await operation(database, disposableUrl.toString())
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
