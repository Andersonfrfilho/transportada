/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { createDigitalCertificateSecretService } from '../../../src/companies/application/digital-certificate-secret.service'
import { createIdempotencyFingerprintService } from '../../../src/companies/application/idempotency-fingerprint.service'
import { createReplaceDigitalCertificateUseCase } from '../../../src/companies/application/replace-digital-certificate.use-case'
import type { ReplaceDigitalCertificateInput } from '../../../src/companies/application/replace-digital-certificate.types'
import { DrizzleDigitalCertificateRepository } from '../../../src/companies/infrastructure/drizzle-digital-certificate.repository'
import { runDatabaseMigrations } from '../../../src/database/database-migration.service'
import {
  companies,
  companyFiscalProfiles,
  identityUsers,
  userCompanyMemberships,
} from '../../../src/database/database.schema'
import type { CompanyContext } from '../../../src/identity/domain/tenant-context'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const HMAC_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1)
const ENVELOPE_KEY = Uint8Array.from({ length: 32 }, (_value, index) => 32 - index)

export const testWithPostgres = databaseUrl === undefined ? test.skip : test
export type TestDatabase = ReturnType<typeof createDrizzleProvider>
export type CertificateUseCase = ReturnType<typeof createReplaceDigitalCertificateUseCase>

export type DigitalCertificateIntegrationFixture = {
  readonly companyId: string
  readonly context: CompanyContext
  readonly database: TestDatabase
  readonly repository: DrizzleDigitalCertificateRepository
  readonly useCase: CertificateUseCase
  readonly userId: string
}

export async function withDigitalCertificateFixture(
  operation: (fixture: DigitalCertificateIntegrationFixture) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (connectionString) => {
    const database = createDrizzleProvider({ connection: connectionString })
    try {
      await operation(await createFixture(database))
    } finally {
      await database.close()
    }
  })
}

export function createCertificateInput(input: {
  readonly context: CompanyContext
  readonly idempotencyKey: string
}): ReplaceDigitalCertificateInput {
  return {
    certificate: new TextEncoder().encode('synthetic-certificate-material'),
    context: input.context,
    correlationId: crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey,
    password: new TextEncoder().encode('synthetic-password-material'),
    purpose: 'cte',
  }
}

export function createContext(input: {
  readonly companyId: string
  readonly userId: string
}): CompanyContext {
  return {
    companyId: input.companyId,
    kind: 'company',
    membershipId: crypto.randomUUID(),
    permissions: new Set(['settings.manage']),
    roles: ['company-admin'],
    userId: input.userId,
  }
}

export function createUseCase(input: {
  readonly cnpj: string
  readonly repository: DrizzleDigitalCertificateRepository
}): CertificateUseCase {
  const envelopeProvider = createSecretEnvelopeProvider({
    activeKeyId: 'integration-v1',
    keys: { 'integration-v1': ENVELOPE_KEY },
  })
  return createReplaceDigitalCertificateUseCase({
    certificateValidationGateway: {
      validate() {
        return {
          certificateCnpj: input.cnpj,
          expiresAt: new Date('2028-01-01T00:00:00.000Z'),
          rejectionCodes: [],
          valid: true,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        }
      },
    },
    createCertificateId: () => crypto.randomUUID(),
    fingerprintService: createIdempotencyFingerprintService({ key: HMAC_KEY }),
    repository: input.repository,
    secretService: createDigitalCertificateSecretService({ envelopeProvider }),
  })
}

async function createFixture(
  database: TestDatabase,
): Promise<DigitalCertificateIntegrationFixture> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await insertProfile({ companyId, database, cnpj: '61156864000191' })
  const repository = new DrizzleDigitalCertificateRepository(database.db)
  return {
    companyId,
    context: createContext({ companyId, userId }),
    database,
    repository,
    useCase: createUseCase({ cnpj: '61156864000191', repository }),
    userId,
  }
}

export async function insertProfile(input: {
  readonly cnpj: string
  readonly companyId: string
  readonly database: TestDatabase
}): Promise<void> {
  await input.database.db.insert(companyFiscalProfiles).values({
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: input.cnpj,
    companyId: input.companyId,
    complement: '',
    district: 'Independencia',
    email: 'fiscal@example.test',
    legalName: 'Transportadora Integration Ltda',
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
  })
}

async function withDisposableDatabase(
  operation: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t018_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  try {
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
