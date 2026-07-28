/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import { FiscalSequenceLockedError } from '../../../src/companies/domain/company-settings.error'
import {
  auditLogs,
  companyFiscalProfiles,
  fiscalSequences,
  idempotencyRecords,
} from '../../../src/database/database.schema'
import {
  createContext,
  testWithPostgres,
  type CompanySettingsIntegrationFixture,
  withCompanySettingsFixture,
} from './company-settings-integration.fixture'

testWithPostgres(
  'keeps audit, reserved environments and rollback atomic',
  async () => {
    await withCompanySettingsFixture(async (fixture) => {
      await createInitialSettings(fixture)
      await updateProfileAndAssertAudit(fixture)
      await reserveAndAssertLock(fixture)
      await switchEnvironmentAndAssertPreservation(fixture)
      await assertAuditFailureRollback(fixture)
    })
  },
  30_000,
)

async function createInitialSettings(fixture: CompanySettingsIntegrationFixture): Promise<void> {
  await fixture.useCase.execute({
    context: fixture.context,
    correlationId: crypto.randomUUID(),
    idempotencyKey: 'settings-create',
    settings: fixture.settings,
  })
}

async function updateProfileAndAssertAudit(
  fixture: CompanySettingsIntegrationFixture,
): Promise<void> {
  const updated = await fixture.useCase.execute({
    context: fixture.context,
    correlationId: crypto.randomUUID(),
    idempotencyKey: 'settings-profile-update',
    settings: {
      ...fixture.settings,
      expectedVersion: 1n,
      profile: { ...fixture.settings.profile, tradeName: 'Transportadora Atualizada' },
    },
  })
  expect(updated.profile.version).toBe(2n)
  expect(updated.cte.version).toBe(1n)
  const audits = await fixture.database.db
    .select({ beforeSnapshot: auditLogs.beforeSnapshot })
    .from(auditLogs)
    .where(eq(auditLogs.companyId, fixture.companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
  expect(audits).toHaveLength(2)
  expect(audits[1]?.beforeSnapshot).toEqual({
    cteRetryBackoffSeconds: '10,60,900',
    cteRetryMaxAttempts: '5',
    environment: 'homologation',
    nextNumber: '13809',
    profileVersion: '1',
    sequenceVersion: '1',
    series: '1',
  })
}

async function reserveAndAssertLock(fixture: CompanySettingsIntegrationFixture): Promise<void> {
  await fixture.database.db
    .update(fiscalSequences)
    .set({ lastReservedNumber: 13_808n })
    .where(and(eq(fiscalSequences.companyId, fixture.companyId), eq(fiscalSequences.model, 'cte')))
  await expect(
    fixture.useCase.execute({
      context: fixture.context,
      correlationId: crypto.randomUUID(),
      idempotencyKey: 'settings-locked-update',
      settings: {
        ...fixture.settings,
        cte: { ...fixture.settings.cte, nextNumber: 13_810n },
        expectedVersion: 2n,
      },
    }),
  ).rejects.toBeInstanceOf(FiscalSequenceLockedError)
  expect(
    (await fixture.repository.findByCompanyId({ companyId: fixture.companyId }))?.cte.nextNumber,
  ).toBe(13_809n)
  const lockedIdempotency = await fixture.database.db
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.companyId, fixture.companyId),
        eq(idempotencyRecords.idempotencyKey, 'settings-locked-update'),
      ),
    )
  expect(lockedIdempotency).toHaveLength(0)
}

async function switchEnvironmentAndAssertPreservation(
  fixture: CompanySettingsIntegrationFixture,
): Promise<void> {
  const production = await fixture.useCase.execute({
    context: fixture.context,
    correlationId: crypto.randomUUID(),
    idempotencyKey: 'settings-production-environment',
    settings: {
      ...fixture.settings,
      cte: { ...fixture.settings.cte, environment: 'production' },
      expectedVersion: 2n,
    },
  })
  expect(production.cte).toMatchObject({
    environment: 'production',
    nextNumber: 13_809n,
    series: 1n,
    version: 1n,
  })
  const sequences = await fixture.database.db
    .select({
      environment: fiscalSequences.environment,
      lastReservedNumber: fiscalSequences.lastReservedNumber,
      nextNumber: fiscalSequences.nextNumber,
    })
    .from(fiscalSequences)
    .where(eq(fiscalSequences.companyId, fixture.companyId))
  expect(sequences).toEqual(
    expect.arrayContaining([
      { environment: 'homologation', lastReservedNumber: 13_808n, nextNumber: 13_809n },
      { environment: 'production', lastReservedNumber: null, nextNumber: 13_809n },
    ]),
  )
  expect(sequences).toHaveLength(2)
}

async function assertAuditFailureRollback(
  fixture: CompanySettingsIntegrationFixture,
): Promise<void> {
  await expect(
    fixture.useCase.execute({
      context: createContext(fixture.rollbackCompanyId, fixture.missingAuditUserId),
      correlationId: crypto.randomUUID(),
      idempotencyKey: 'settings-audit-rollback',
      settings: {
        ...fixture.settings,
        profile: { ...fixture.settings.profile, cnpj: '61156864000193' },
      },
    }),
  ).rejects.toThrow()
  for (const table of [companyFiscalProfiles, fiscalSequences, idempotencyRecords]) {
    expect(
      await fixture.database.db
        .select()
        .from(table)
        .where(eq(table.companyId, fixture.rollbackCompanyId)),
    ).toHaveLength(0)
  }
}
