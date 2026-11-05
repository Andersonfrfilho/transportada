/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0047, emenda 2026-11-05: a membership sintética de um serviço fica fora das escritas em lote de
 * papel, grupo e permissão avulsa. A recusa é um `not exists` no SQL, e só o banco de verdade diz se
 * ele casa a linha certa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyGroups,
  membershipGroups,
  membershipPermissions,
  membershipRoles,
} from '../../src/database/database.schema.js'
import type { CompanyRole } from '../../src/database/identity.schema.js'
import { DrizzleCompanyGroupRepository } from '../../src/identity/infrastructure/drizzle-company-group.repository.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const ISSUER = 'https://keycloak.test/realms/transportada'

describe('membership sintética do serviço fora das escritas em lote', () => {
  testWithPostgres('papéis em lote alcançam a pessoa e pulam o serviço', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { companyId, person, service } = await seedPersonAndService(db)
      const repository = new DrizzleCompanyUserRepository(db)

      const { affectedUserIds } = await repository.addRoles({
        companyId,
        roles: ['fiscal'],
        userIds: [person.userId, service.userId],
      })

      expect(affectedUserIds).toEqual([person.userId])
      expect(await readRoles(db, service.membershipId)).toEqual(['automation'])
      expect(await readRoles(db, person.membershipId)).toEqual(['fiscal', 'viewer'])
    })
  })

  testWithPostgres('grupo e permissão avulsa não chegam ao serviço', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { companyId, person, service } = await seedPersonAndService(db)
      const repository = new DrizzleCompanyGroupRepository(db)
      const groupId = crypto.randomUUID()
      await db.insert(companyGroups).values({ companyId, id: groupId, name: 'Fiscal' })

      const { affected } = await repository.assign({
        companyId,
        groupIds: [groupId],
        userIds: [person.userId, service.userId],
      })
      await repository.grantDirectPermissions({
        companyId,
        grantedByUserId: person.userId,
        permissions: ['billing.read'],
        userId: service.userId,
      })

      expect(affected.map((change) => change.userId)).toEqual([person.userId])
      const serviceGroups = await db
        .select()
        .from(membershipGroups)
        .where(eq(membershipGroups.membershipId, service.membershipId))
      const servicePermissions = await db
        .select()
        .from(membershipPermissions)
        .where(eq(membershipPermissions.membershipId, service.membershipId))
      expect(serviceGroups).toEqual([])
      expect(servicePermissions).toEqual([])
    })
  })
})

async function seedPersonAndService(db: TestDatabase['db']) {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  const repository = new DrizzleCompanyUserRepository(db)
  const person = buildInvite(companyId)
  const service = buildInvite(companyId)
  const personMembership = await repository.createInvitedUser(person)
  const serviceMembership = await repository.createInvitedUser(service)
  /** O provisionamento do serviço grava o papel direto: o convite não aceita papel de serviço. */
  await db
    .delete(membershipRoles)
    .where(eq(membershipRoles.membershipId, serviceMembership.membershipId))
  await db
    .insert(membershipRoles)
    .values({ membershipId: serviceMembership.membershipId, role: 'automation' })

  return {
    companyId,
    person: { membershipId: personMembership.membershipId, userId: person.userId },
    service: { membershipId: serviceMembership.membershipId, userId: service.userId },
  }
}

function buildInvite(companyId: string) {
  const userId = crypto.randomUUID()
  return {
    companyId,
    contactAddress: `${userId}@empresa.test`,
    contactChannel: 'email' as const,
    email: `${userId}@empresa.test`,
    issuer: ISSUER,
    name: 'Pessoa Convidada',
    phone: '',
    roles: ['viewer'] as const,
    subject: crypto.randomUUID(),
    taxId: '',
    userId,
    username: userId,
  }
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
  const databaseName = `transportada_servicewrites_${crypto.randomUUID().replaceAll('-', '')}`
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
