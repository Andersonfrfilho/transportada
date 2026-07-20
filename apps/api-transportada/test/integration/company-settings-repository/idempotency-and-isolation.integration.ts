/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { CompanyFiscalProfileConflictError } from '../../../src/companies/domain/company-settings.error'
import { auditLogs, idempotencyRecords } from '../../../src/database/database.schema'
import {
  createSettings,
  testWithPostgres,
  withCompanySettingsFixture,
} from './company-settings-integration.fixture'

testWithPostgres(
  'replays concurrent settings updates and isolates every company',
  async () => {
    await withCompanySettingsFixture(async (fixture) => {
      const [first, replay] = await Promise.all([
        fixture.useCase.execute({
          context: fixture.context,
          correlationId: crypto.randomUUID(),
          idempotencyKey: 'settings-create',
          settings: fixture.settings,
        }),
        fixture.useCase.execute({
          context: fixture.context,
          correlationId: crypto.randomUUID(),
          idempotencyKey: 'settings-create',
          settings: fixture.settings,
        }),
      ])

      expect(first).toEqual(replay)
      expect(await fixture.repository.findByCompanyId({ companyId: fixture.companyId })).toEqual(
        first,
      )
      expect(
        await fixture.repository.findByCompanyId({ companyId: fixture.otherCompanyId }),
      ).toBeNull()
      await expectSingleEffectRecords(fixture)
      await expectDuplicateCnpjConflict(fixture)

      const other = await fixture.useCase.execute({
        context: fixture.otherContext,
        correlationId: crypto.randomUUID(),
        idempotencyKey: 'other-settings-create',
        settings: createSettings('61156864000192'),
      })
      expect(other.profile.cnpj).toBe('61156864000192')
      expect(
        (await fixture.repository.findByCompanyId({ companyId: fixture.companyId }))?.profile.cnpj,
      ).toBe('61156864000191')
    })
  },
  30_000,
)

async function expectSingleEffectRecords(
  fixture: Parameters<Parameters<typeof withCompanySettingsFixture>[0]>[0],
): Promise<void> {
  const idempotency = await fixture.database.db
    .select()
    .from(idempotencyRecords)
    .where(eq(idempotencyRecords.companyId, fixture.companyId))
  const audits = await fixture.database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, fixture.companyId))
  expect(idempotency).toHaveLength(1)
  expect(audits).toHaveLength(1)
}

async function expectDuplicateCnpjConflict(
  fixture: Parameters<Parameters<typeof withCompanySettingsFixture>[0]>[0],
): Promise<void> {
  await expect(
    fixture.useCase.execute({
      context: fixture.otherContext,
      correlationId: crypto.randomUUID(),
      idempotencyKey: 'duplicate-cnpj',
      settings: fixture.settings,
    }),
  ).rejects.toBeInstanceOf(CompanyFiscalProfileConflictError)
  expect(await fixture.repository.findByCompanyId({ companyId: fixture.otherCompanyId })).toBeNull()
}
