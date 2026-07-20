/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  digitalCertificates,
  identityUsers,
  companies,
} from '../../../src/database/database.schema'
import {
  testWithPostgres,
  withDigitalCertificateFixture,
  type DigitalCertificateIntegrationFixture,
} from './digital-certificate-integration.fixture'

describe('digital certificate repository listing integration', () => {
  testWithPostgres('keeps two cursor pages tenant-scoped without gaps or duplicates', async () => {
    await withDigitalCertificateFixture(async (fixture) => {
      await seedListingScenario({ fixture })
      await assertTwoPages({ fixture })
    })
  })
})

async function assertTwoPages(input: {
  readonly fixture: DigitalCertificateIntegrationFixture
}): Promise<void> {
  const first = await input.fixture.repository.list({
    companyId: input.fixture.companyId,
    limit: 2,
  })
  const second = await input.fixture.repository.list({
    companyId: input.fixture.companyId,
    cursor: requiredCursor(first.nextCursor),
    limit: 2,
  })
  const identifiers = [...first.items, ...second.items].map((item) => item.id)
  expect(first.items).toHaveLength(2)
  expect(second.items).toHaveLength(1)
  expect(new Set(identifiers)).toEqual(new Set([uuid(1), uuid(2), uuid(3)]))
  expect(identifiers).not.toContain(uuid(4))
  expect(second.nextCursor).toBeUndefined()
}

async function seedListingScenario(input: {
  readonly fixture: DigitalCertificateIntegrationFixture
}): Promise<void> {
  const foreign = await createForeignScope(input.fixture)
  await insertTenantCertificates(input.fixture)
  await insertForeignCertificate({ fixture: input.fixture, foreign })
  await setMicroseconds({
    fixture: input.fixture,
    id: uuid(1),
    value: '2026-07-20T10:00:00.000100Z',
  })
  await setMicroseconds({
    fixture: input.fixture,
    id: uuid(2),
    value: '2026-07-20T10:00:00.000900Z',
  })
}

async function createForeignScope(
  fixture: DigitalCertificateIntegrationFixture,
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const foreignCompanyId = crypto.randomUUID()
  const foreignUserId = crypto.randomUUID()
  await fixture.database.db.insert(companies).values({ id: foreignCompanyId, status: 'active' })
  await fixture.database.db.insert(identityUsers).values({ id: foreignUserId, status: 'active' })
  return { companyId: foreignCompanyId, userId: foreignUserId }
}

async function insertTenantCertificates(
  fixture: DigitalCertificateIntegrationFixture,
): Promise<void> {
  const sameMillisecond = new Date('2026-07-20T10:00:00.000Z')
  await fixture.database.db.insert(digitalCertificates).values([
    certificate({
      companyId: fixture.companyId,
      createdAt: sameMillisecond,
      id: uuid(1),
      userId: fixture.userId,
      version: 1n,
    }),
    certificate({
      companyId: fixture.companyId,
      createdAt: sameMillisecond,
      id: uuid(2),
      userId: fixture.userId,
      version: 2n,
    }),
    certificate({
      companyId: fixture.companyId,
      createdAt: new Date('2026-07-21T10:00:00.000Z'),
      id: uuid(3),
      status: 'active',
      userId: fixture.userId,
      version: 3n,
    }),
  ])
}

async function insertForeignCertificate(input: {
  readonly fixture: DigitalCertificateIntegrationFixture
  readonly foreign: { readonly companyId: string; readonly userId: string }
}): Promise<void> {
  await input.fixture.database.db.insert(digitalCertificates).values(
    certificate({
      companyId: input.foreign.companyId,
      createdAt: new Date('2026-07-22T10:00:00.000Z'),
      id: uuid(4),
      status: 'active',
      userId: input.foreign.userId,
      version: 1n,
    }),
  )
}

function setMicroseconds(input: {
  readonly fixture: DigitalCertificateIntegrationFixture
  readonly id: string
  readonly value: string
}) {
  return input.fixture.database.db.execute(
    sql`update digital_certificates set created_at = ${input.value}::timestamptz where id = ${input.id}`,
  )
}

function certificate(input: {
  readonly companyId: string
  readonly createdAt: Date
  readonly id: string
  readonly status?: 'active' | 'retired'
  readonly userId: string
  readonly version: bigint
}): typeof digitalCertificates.$inferInsert {
  const isActive = input.status === 'active'
  return {
    companyId: input.companyId,
    createdAt: input.createdAt,
    expiresAt: new Date('2028-01-01T00:00:00.000Z'),
    fingerprint: `synthetic-fingerprint-${input.id}`,
    id: input.id,
    purpose: 'cte',
    secretEnvelope: isActive
      ? {
          algorithm: 'A256GCM',
          ciphertext: 'synthetic',
          keyId: 'integration-v1',
          nonce: 'synthetic',
          version: 1,
        }
      : null,
    status: input.status ?? 'retired',
    updatedAt: input.createdAt,
    validatedCnpj: '61156864000191',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: input.version,
    createdByUserId: input.userId,
  }
}

function requiredCursor(cursor: { readonly createdAt: Date; readonly id: string } | undefined): {
  readonly createdAt: Date
  readonly id: string
} {
  if (cursor === undefined) throw new Error('Expected next cursor')
  return cursor
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
}
