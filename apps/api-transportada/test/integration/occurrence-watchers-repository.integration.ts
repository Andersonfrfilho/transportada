/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: as listas de responsáveis contra um Postgres de verdade — FKs, tetos sob lock, a elegibilidade em lote
 * (papel, grupo e concessão direta) e a auditoria na mesma transação, sem endereço.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import {
  OccurrenceWatcherListTooLongError,
  OccurrenceWatcherNotFoundError,
} from '../../src/contractor-mail/domain/occurrence-watcher.error.js'
import { DrizzleOccurrenceWatcherRepository } from '../../src/contractor-mail/infrastructure/drizzle-occurrence-watcher.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  companyGroupPermissions,
  companyGroups,
  contractors,
  identityUserProfiles,
  identityUsers,
  membershipGroups,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('occurrence watchers repository integration (spec 267)', () => {
  testWithPostgres(
    'adds, deactivates, reactivates and removes, auditing each change without any address',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const actor = await seedMember(database, tenant.companyId, { role: 'operator' })
        const ana = await seedMember(database, tenant.companyId, { role: 'operator' })
        const repository = new DrizzleOccurrenceWatcherRepository(database.db)
        const scope = { companyId: tenant.companyId, kind: 'company' } as const
        const write = (userId: string) => ({
          actorUserId: actor.userId,
          correlationId: 'corr-1',
          scope,
          userId,
        })

        expect(await repository.addWatcher(write(ana.userId))).toBe(true)
        expect(await repository.addWatcher(write(ana.userId))).toBe(false)
        await repository.setWatcherStatus({ ...write(ana.userId), status: 'inactive' })
        await repository.setWatcherStatus({ ...write(ana.userId), status: 'inactive' })
        expect(await repository.listWatcherRows(scope)).toEqual([
          { status: 'inactive', userId: ana.userId },
        ])
        await repository.setWatcherStatus({ ...write(ana.userId), status: 'active' })
        await repository.removeWatcher(write(ana.userId))
        expect(await repository.listWatcherRows(scope)).toEqual([])
        await expect(repository.removeWatcher(write(ana.userId))).rejects.toBeInstanceOf(
          OccurrenceWatcherNotFoundError,
        )

        const logs = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, ana.userId))
        expect(logs.map((log) => log.action).sort()).toEqual([
          'occurrence_watchers.company.activate',
          'occurrence_watchers.company.add',
          'occurrence_watchers.company.deactivate',
          'occurrence_watchers.company.remove',
        ])
        const add = logs.find((log) => log.action.endsWith('.add'))
        expect(add?.beforeSnapshot).toBeNull()
        expect(add?.afterSnapshot).toEqual({
          contractorId: null,
          status: 'active',
          userId: ana.userId,
        })
        expect(add?.permission).toBe('settings.manage')
        expect(JSON.stringify(logs)).not.toContain('@')
      })
    },
    60_000,
  )

  testWithPostgres(
    'caps a list at 10 active and 30 rows in total, contractor lists included',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const actor = await seedMember(database, tenant.companyId, { role: 'operator' })
        const repository = new DrizzleOccurrenceWatcherRepository(database.db)
        const scope = {
          companyId: tenant.companyId,
          contractorId: tenant.contractorId,
          kind: 'contractor',
        } as const
        const members = await Promise.all(
          Array.from({ length: 31 }, () =>
            seedMember(database, tenant.companyId, { role: 'operator' }),
          ),
        )
        const write = (userId: string) => ({
          actorUserId: actor.userId,
          correlationId: 'corr-cap',
          scope,
          userId,
        })
        for (const member of members.slice(0, 10)) await repository.addWatcher(write(member.userId))
        const eleventh = members[10]?.userId ?? ''
        await expect(repository.addWatcher(write(eleventh))).rejects.toBeInstanceOf(
          OccurrenceWatcherListTooLongError,
        )
        for (const member of members.slice(0, 10)) {
          await repository.setWatcherStatus({ ...write(member.userId), status: 'inactive' })
        }
        for (const member of members.slice(10, 30)) {
          await repository.addWatcher(write(member.userId))
          await repository.setWatcherStatus({ ...write(member.userId), status: 'inactive' })
        }
        await expect(
          repository.addWatcher(write(members[30]?.userId ?? '')),
        ).rejects.toBeInstanceOf(OccurrenceWatcherListTooLongError)
        await repository.setWatcherStatus({ ...write(members[0]?.userId ?? ''), status: 'active' })
        expect((await repository.listWatcherRows(scope)).length).toBe(30)
      })
    },
    120_000,
  )

  testWithPostgres(
    'finds eligible users in batch: role, group grant, wrong channel, disabled and foreign members',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const other = await seedTenant(database)
        const byRole = await seedMember(database, tenant.companyId, { role: 'operator' })
        const noPermission = await seedMember(database, tenant.companyId, { role: 'fiscal' })
        const byGroup = await seedMember(database, tenant.companyId, { role: 'fiscal' })
        await grantByGroup(database, tenant.companyId, byGroup.membershipId)
        const byPhone = await seedMember(database, tenant.companyId, {
          channel: 'whatsapp',
          role: 'operator',
        })
        /** Endereço que injetaria cabeçalho ou viraria lista no `Cc`: o usuário fica sem endereço (inelegível). */
        const unsafe = await seedMember(database, tenant.companyId, {
          address: 'um@empresa.test, dois@empresa.test',
          role: 'operator',
        })
        const disabled = await seedMember(database, tenant.companyId, {
          role: 'operator',
          status: 'disabled',
        })
        const foreign = await seedMember(database, other.companyId, { role: 'operator' })
        const repository = new DrizzleOccurrenceWatcherRepository(database.db)

        const everyone = await repository.findWatcherUsers({ companyId: tenant.companyId })
        const byId = new Map(everyone.map((user) => [user.userId, user]))
        expect(byId.get(byRole.userId)).toMatchObject({ address: byRole.address, canResolve: true })
        expect(byId.get(noPermission.userId)?.canResolve).toBe(false)
        expect(byId.get(byGroup.userId)?.canResolve).toBe(true)
        expect(byId.get(byPhone.userId)?.address).toBeUndefined()
        expect(byId.get(unsafe.userId)?.address).toBeUndefined()
        expect(byId.has(disabled.userId)).toBe(false)
        expect(byId.has(foreign.userId)).toBe(false)

        const crossTenant = await repository.findWatcherUsers({
          companyId: tenant.companyId,
          userIds: [foreign.userId],
        })
        expect(crossTenant).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'loads the effective candidates of both lists with addresses only for who can still resolve',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const actor = await seedMember(database, tenant.companyId, { role: 'operator' })
        const ana = await seedMember(database, tenant.companyId, { role: 'operator' })
        const lost = await seedMember(database, tenant.companyId, { role: 'operator' })
        const repository = new DrizzleOccurrenceWatcherRepository(database.db)
        const company = { companyId: tenant.companyId, kind: 'company' } as const
        const contractor = {
          ...company,
          contractorId: tenant.contractorId,
          kind: 'contractor',
        } as const
        const base = { actorUserId: actor.userId, correlationId: 'corr-load' }
        await repository.addWatcher({ ...base, scope: company, userId: ana.userId })
        await repository.addWatcher({ ...base, scope: contractor, userId: lost.userId })
        await database.db
          .delete(membershipRoles)
          .where(eq(membershipRoles.membershipId, lost.membershipId))

        const loaded = await repository.loadEffectiveCandidates({
          companyId: tenant.companyId,
          contractorId: tenant.contractorId,
        })
        expect(loaded.company).toEqual([
          { address: ana.address, name: ana.name, status: 'active', userId: ana.userId },
        ])
        expect(loaded.contractor).toEqual([
          { address: undefined, name: lost.name, status: 'active', userId: lost.userId },
        ])
      })
    },
    60_000,
  )
})

let memberSequence = 0

async function seedTenant(
  database: TestDatabase,
): Promise<{ readonly companyId: string; readonly contractorId: string }> {
  const companyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Contratante Sintética',
    id: contractorId,
    taxId: '30290856000160',
  })
  return { companyId, contractorId }
}

async function seedMember(
  database: TestDatabase,
  companyId: string,
  options: {
    readonly address?: string
    readonly channel?: 'email' | 'whatsapp'
    readonly role: 'fiscal' | 'operator'
    readonly status?: 'active' | 'disabled'
  },
): Promise<{ address: string; membershipId: string; name: string; userId: string }> {
  memberSequence += 1
  const userId = crypto.randomUUID()
  const name = `Pessoa ${memberSequence}`
  const address = options.address ?? `pessoa${memberSequence}@empresa.test`
  await database.db.insert(identityUsers).values({ id: userId })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: address,
    contactChannel: options.channel ?? 'email',
    email: address,
    name,
    phone: '',
    taxId: '',
    userId,
    username: `pessoa-${userId.slice(0, 8)}`,
  })
  const [membership] = await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, status: options.status ?? 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  const membershipId = membership?.id ?? ''
  await database.db.insert(membershipRoles).values({ membershipId, role: options.role })
  return { address, membershipId, name, userId }
}

async function grantByGroup(
  database: TestDatabase,
  companyId: string,
  membershipId: string,
): Promise<void> {
  const [group] = await database.db
    .insert(companyGroups)
    .values({ companyId, name: `Grupo ${crypto.randomUUID()}` })
    .returning({ id: companyGroups.id })
  const groupId = group?.id ?? ''
  await database.db
    .insert(companyGroupPermissions)
    .values({ groupId, permission: 'occurrences.resolve' })
  await database.db.insert(membershipGroups).values({ groupId, membershipId })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_watchers',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
