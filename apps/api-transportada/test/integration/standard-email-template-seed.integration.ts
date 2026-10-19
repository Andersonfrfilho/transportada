/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.9, contra Postgres real: o pré-deploy grava a v1 do modelo padrão de e-mail por empresa,
 * a segunda passada não grava nada, versão editada pela empresa fica intacta e duas chamadas
 * concorrentes para a mesma empresa não falham.
 */
import { describe, expect } from 'bun:test'
import { sql } from 'drizzle-orm'

import { companies } from '../../src/database/identity.schema.js'
import {
  ensureStandardEmailTemplate,
  seedStandardEmailTemplates,
} from '../../src/database/standard-email-template-seed.service.js'
import { createApiNotificationModule } from '../../src/notification/infrastructure/notification-module.factory.js'
import { withNotificationDatabase } from '../fixtures/notification-template.fixture.js'
import { seedNotificationTemplate } from '../fixtures/notification-template.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const STANDARD_EMAIL_KEY = 'notification.standard-email'
const TEST_TIMEOUT_MS = 90_000

const CONFIG = {
  cryptography: { notificationSuppressionHmacKey: 'test-suppression-hmac-key-0123456789' },
  emailChannelEnabled: false,
} as never

function runSeed(database: TestDatabase) {
  const module = createApiNotificationModule({ config: CONFIG, db: database.db })

  return seedStandardEmailTemplates({
    ensureTemplate: (params) => module.standardEmail.ensureTemplate(params),
    listCompanyIds: async () =>
      (await database.db.select({ id: companies.id }).from(companies)).map((row) => row.id),
  })
}

async function rowsOf(database: TestDatabase) {
  const result = await database.db.execute(sql`
    select company_id::text as company_id, version, active
    from notification.templates where key = ${STANDARD_EMAIL_KEY}
    order by company_id, version`)

  return [...result] as Array<{ company_id: string; version: number; active: boolean }>
}

describe('seed do modelo padrão de e-mail contra Postgres real', () => {
  testWithPostgres(
    'grava a v1 por empresa, a segunda passada grava zero e a versão editada fica intacta',
    async () => {
      await withNotificationDatabase(async (database) => {
        const [first, second, edited] = await database.db
          .insert(companies)
          .values([{ status: 'active' }, { status: 'active' }, { status: 'active' }])
          .returning({ id: companies.id })
        if (first === undefined || second === undefined || edited === undefined) {
          throw new Error('COMPANIES_EXPECTED')
        }
        await seedNotificationTemplate(database, {
          body: 'editado pela empresa',
          channel: 'email',
          companyId: edited.id,
          key: STANDARD_EMAIL_KEY,
          version: 2,
        })

        const firstRun = await runSeed(database)
        expect(firstRun).toEqual({ companies: 3, written: 2 })
        const afterFirst = await rowsOf(database)
        expect(afterFirst.filter((row) => row.company_id === first.id)).toHaveLength(1)
        expect(afterFirst.find((row) => row.company_id === first.id)?.version).toBe(1)
        expect(afterFirst.filter((row) => row.company_id === edited.id)).toEqual([
          { active: true, company_id: edited.id, version: 2 },
        ])

        expect(await runSeed(database)).toEqual({ companies: 3, written: 0 })
        expect(await rowsOf(database)).toEqual(afterFirst)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'duas chamadas concorrentes para a mesma empresa não falham e deixam uma linha',
    async () => {
      await withNotificationDatabase(async (database) => {
        const [company] = await database.db
          .insert(companies)
          .values([{ status: 'active' }])
          .returning({ id: companies.id })
        if (company === undefined) throw new Error('COMPANY_EXPECTED')
        const module = createApiNotificationModule({ config: CONFIG, db: database.db })

        const results = await Promise.all([
          ensureStandardEmailTemplate((params) => module.standardEmail.ensureTemplate(params), {
            companyId: company.id,
          }),
          ensureStandardEmailTemplate((params) => module.standardEmail.ensureTemplate(params), {
            companyId: company.id,
          }),
        ])

        expect(results.filter(Boolean)).toHaveLength(1)
        expect(await rowsOf(database)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
