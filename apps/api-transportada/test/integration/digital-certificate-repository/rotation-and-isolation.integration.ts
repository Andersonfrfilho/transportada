/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import {
  auditLogs,
  companies,
  digitalCertificates,
  idempotencyRecords,
} from '../../../src/database/database.schema'
import {
  createCertificateInput,
  createContext,
  createUseCase,
  insertProfile,
  testWithPostgres,
  withDigitalCertificateFixture,
} from './digital-certificate-integration.fixture'

testWithPostgres(
  'serializes rotation, replay, rollback, and tenant isolation in PostgreSQL',
  async () => {
    await withDigitalCertificateFixture(async (fixture) => {
      const [first, second] = await Promise.all([
        fixture.useCase.execute(
          createCertificateInput({
            context: fixture.context,
            idempotencyKey: 'certificate-concurrent-0001',
          }),
        ),
        fixture.useCase.execute(
          createCertificateInput({
            context: fixture.context,
            idempotencyKey: 'certificate-concurrent-0002',
          }),
        ),
      ])
      expect([first.version, second.version].sort()).toEqual([1n, 2n])
      await expectSingleActiveHistory(fixture)

      const replay = await fixture.useCase.execute(
        createCertificateInput({
          context: fixture.context,
          idempotencyKey: 'certificate-concurrent-0001',
        }),
      )
      expect(replay).toEqual(first)
      await expectEffectCounts({ auditCount: 2, fixture, idempotencyCount: 2 })
      await expectRollbackPreservesActive(fixture)
      await expectOtherTenantIsolation(fixture)
    })
  },
  30_000,
)

async function expectSingleActiveHistory(
  fixture: Parameters<Parameters<typeof withDigitalCertificateFixture>[0]>[0],
): Promise<void> {
  const certificates = await fixture.database.db
    .select({
      secretEnvelope: digitalCertificates.secretEnvelope,
      status: digitalCertificates.status,
      version: digitalCertificates.version,
    })
    .from(digitalCertificates)
    .where(eq(digitalCertificates.companyId, fixture.companyId))
    .orderBy(asc(digitalCertificates.version))
  expect(certificates).toHaveLength(2)
  expect(certificates.map(({ status, version }) => ({ status, version }))).toEqual([
    { status: 'retired', version: 1n },
    { status: 'active', version: 2n },
  ])
  expect(certificates[0]?.secretEnvelope).toBeNull()
  expect(certificates[1]?.secretEnvelope).not.toBeNull()
  const serialized = JSON.stringify(certificates, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  )
  expect(serialized).not.toContain('synthetic-password-material')
  expect(serialized).not.toContain('synthetic-certificate-material')
}

async function expectRollbackPreservesActive(
  fixture: Parameters<Parameters<typeof withDigitalCertificateFixture>[0]>[0],
): Promise<void> {
  const invalidContext = createContext({
    companyId: fixture.companyId,
    userId: crypto.randomUUID(),
  })
  await expect(
    fixture.useCase.execute(
      createCertificateInput({
        context: invalidContext,
        idempotencyKey: 'certificate-rollback-0001',
      }),
    ),
  ).rejects.toMatchObject({ code: 'DIGITAL_CERTIFICATE_OPERATION_FAILED', status: 500 })
  const certificates = await fixture.database.db
    .select({ status: digitalCertificates.status, version: digitalCertificates.version })
    .from(digitalCertificates)
    .where(eq(digitalCertificates.companyId, fixture.companyId))
  expect(certificates).toHaveLength(2)
  expect(certificates.filter(({ status }) => status === 'active')).toEqual([
    { status: 'active', version: 2n },
  ])
  await expectEffectCounts({ auditCount: 2, fixture, idempotencyCount: 2 })
}

async function expectOtherTenantIsolation(
  fixture: Parameters<Parameters<typeof withDigitalCertificateFixture>[0]>[0],
): Promise<void> {
  const companyId = crypto.randomUUID()
  await fixture.database.db.insert(companies).values({ id: companyId, status: 'active' })
  await insertProfile({ cnpj: '61156864000192', companyId, database: fixture.database })
  const context = createContext({ companyId, userId: fixture.userId })
  const useCase = createUseCase({ cnpj: '61156864000192', repository: fixture.repository })
  await useCase.execute(
    createCertificateInput({ context, idempotencyKey: 'other-certificate-0001' }),
  )
  const active = await fixture.database.db
    .select({ companyId: digitalCertificates.companyId })
    .from(digitalCertificates)
    .where(eq(digitalCertificates.status, 'active'))
  expect(active.map(({ companyId: id }) => id).sort()).toEqual(
    [companyId, fixture.companyId].sort(),
  )
}

async function expectEffectCounts(input: {
  readonly auditCount: number
  readonly fixture: Parameters<Parameters<typeof withDigitalCertificateFixture>[0]>[0]
  readonly idempotencyCount: number
}): Promise<void> {
  const audits = await input.fixture.database.db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, input.fixture.companyId),
        eq(auditLogs.action, 'digital-certificate.replaced'),
      ),
    )
  const idempotency = await input.fixture.database.db
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.companyId, input.fixture.companyId),
        eq(idempotencyRecords.operation, 'digital-certificate.replace'),
      ),
    )
  expect(audits).toHaveLength(input.auditCount)
  expect(idempotency).toHaveLength(input.idempotencyCount)
}
