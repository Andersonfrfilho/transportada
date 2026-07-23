/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createIdempotencyFingerprintService } from '../../../src/companies/application/idempotency-fingerprint.service'
import type { CompanySettingsInput } from '../../../src/companies/application/company-settings.port'
import { createUpdateCompanySettingsUseCase } from '../../../src/companies/application/update-company-settings.use-case'
import { DrizzleCompanySettingsRepository } from '../../../src/companies/infrastructure/drizzle-company-settings.repository'
import { runDatabaseMigrations } from '../../../src/database/database-migration.service'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../../src/database/database.schema'
import type { CompanyContext } from '../../../src/identity/domain/tenant-context'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const HMAC_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1)

export const testWithPostgres = databaseUrl === undefined ? test.skip : test
export type TestDatabase = ReturnType<typeof createDrizzleProvider>
export type SettingsUseCase = ReturnType<typeof createUpdateCompanySettingsUseCase>

export type CompanySettingsIntegrationFixture = {
  readonly companyId: string
  readonly context: CompanyContext
  readonly database: TestDatabase
  readonly missingAuditUserId: string
  readonly otherCompanyId: string
  readonly otherContext: CompanyContext
  readonly repository: DrizzleCompanySettingsRepository
  readonly rollbackCompanyId: string
  readonly settings: CompanySettingsInput
  readonly useCase: SettingsUseCase
}

export async function withCompanySettingsFixture(
  operation: (fixture: CompanySettingsIntegrationFixture) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (connectionString) => {
    const database = createDrizzleProvider({ connection: connectionString })
    try {
      const fixture = await createFixture(database)
      await operation(fixture)
    } finally {
      await database.close()
    }
  })
}

export function createContext(companyId: string, userId: string): CompanyContext {
  return {
    companyId,
    kind: 'company',
    membershipId: crypto.randomUUID(),
    permissions: new Set(['settings.manage']),
    roles: ['company-admin'],
    userId,
  }
}

export function createSettings(cnpj: string): CompanySettingsInput {
  return {
    cte: { environment: 'homologation', nextNumber: 13_809n, series: 1n },
    expectedVersion: null,
    profile: {
      city: 'Ribeirao Preto',
      cityIbgeCode: '3543402',
      cnpj,
      complement: '',
      district: 'Independencia',
      email: 'fiscal@example.test',
      legalName: 'Transportadora Integration Test Ltda',
      municipalRegistration: '',
      number: '2296',
      phone: '1600000000',
      postalCode: '14076400',
      rntrc: '58151044',
      state: 'SP',
      stateRegistration: '154336693112',
      street: 'Rua Integration',
      taxRegime: '1',
      tradeName: 'Transportadora Integration',
    },
  }
}

async function createFixture(database: TestDatabase): Promise<CompanySettingsIntegrationFixture> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const rollbackCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
    { id: rollbackCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values([
    { companyId, id: crypto.randomUUID(), status: 'active', userId },
    { companyId: otherCompanyId, id: crypto.randomUUID(), status: 'active', userId },
    { companyId: rollbackCompanyId, id: crypto.randomUUID(), status: 'active', userId },
  ])
  const repository = new DrizzleCompanySettingsRepository(database.db)
  return {
    companyId,
    context: createContext(companyId, userId),
    database,
    missingAuditUserId: crypto.randomUUID(),
    otherCompanyId,
    otherContext: createContext(otherCompanyId, userId),
    repository,
    rollbackCompanyId,
    settings: createSettings('61156864000191'),
    useCase: createUpdateCompanySettingsUseCase({
      fingerprintService: createIdempotencyFingerprintService({ key: HMAC_KEY }),
      unitOfWork: repository,
    }),
  }
}

async function withDisposableDatabase(
  operation: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t014_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    await operation(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}
