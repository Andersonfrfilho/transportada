/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { fiscalSequences } from '../../../src/database/database.schema'
import {
  testWithPostgres,
  type CompanySettingsIntegrationFixture,
  withCompanySettingsFixture,
} from './company-settings-integration.fixture'

// O refresh de staging trunca `fiscal_sequences` e mantém o perfil (deploy/staging-refresh):
// a leitura respondia 500 com `Error` genérico, sem motivo no log.
testWithPostgres(
  'reads settings whose CT-e sequence was wiped and lets the next save recreate it',
  async () => {
    await withCompanySettingsFixture(async (fixture) => {
      await createInitialSettings(fixture)
      await fixture.database.db
        .delete(fiscalSequences)
        .where(eq(fiscalSequences.companyId, fixture.companyId))

      const read = await fixture.repository.findByCompanyId({ companyId: fixture.companyId })

      expect(read?.profile.version).toBe(1n)
      expect(read?.cte).toEqual({
        environment: 'homologation',
        nextNumber: 1n,
        series: 1n,
        version: 1n,
      })
      await saveReadSettingsAndAssertSequence(fixture)
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

async function saveReadSettingsAndAssertSequence(
  fixture: CompanySettingsIntegrationFixture,
): Promise<void> {
  const saved = await fixture.useCase.execute({
    context: fixture.context,
    correlationId: crypto.randomUUID(),
    idempotencyKey: 'settings-after-wipe',
    settings: {
      ...fixture.settings,
      cte: { environment: 'homologation', nextNumber: 1n, series: 1n },
      expectedVersion: 1n,
    },
  })
  expect(saved.profile.version).toBe(2n)
  const sequences = await fixture.database.db
    .select({ nextNumber: fiscalSequences.nextNumber, series: fiscalSequences.series })
    .from(fiscalSequences)
    .where(
      and(
        eq(fiscalSequences.companyId, fixture.companyId),
        eq(fiscalSequences.environment, 'homologation'),
      ),
    )
  expect(sequences).toEqual([{ nextNumber: 1n, series: 1n }])
}
