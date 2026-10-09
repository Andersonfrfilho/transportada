/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.4 (CA6): o liga/desliga da importação da empresa contra Postgres. O upsert grava só `is_enabled`, a
 * auditoria nasce na mesma transação e só quando o valor efetivo muda, e uma empresa nunca altera a outra.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createHolidayImportEnablementUseCases } from '../../src/business-calendar/application/holiday-import-enablement.use-case.js'
import { DrizzleHolidayImportEnablementRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-import-enablement.repository.js'
import { createHolidayImportEnablementRoutes } from '../../src/business-calendar/presentation/holiday-import-enablement.routes.js'
import { companyHolidayImportSettings } from '../../src/database/database.schema.js'
import {
  actorOf,
  databaseUrl,
  readAudits,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  CLIENT_IP,
  createRoutesHttpFixture,
  getRequest,
  writeRequest,
} from '../fixtures/holiday-provider-settings-http.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const PATH = '/company-settings/holiday-import'
const CURSOR_AT = new Date('2026-10-01T12:00:00.000Z')
const CURSOR_DOCUMENT_ID = '00000000-0000-4000-8000-0000000262f1'

type Tenant = { readonly companyId: string; readonly userId: string }

function http(database: TestDatabase, tenant: Tenant, permissions: readonly string[]) {
  const useCases = createHolidayImportEnablementUseCases({
    repository: new DrizzleHolidayImportEnablementRepository(database.db),
  })
  return createRoutesHttpFixture({
    companyId: tenant.companyId,
    permissions,
    routes: createHolidayImportEnablementRoutes({ ...useCases, resolveClientIp: () => CLIENT_IP }),
    userId: tenant.userId,
  })
}

async function readRow(database: TestDatabase, companyId: string) {
  const [row] = await database.db
    .select()
    .from(companyHolidayImportSettings)
    .where(eq(companyHolidayImportSettings.companyId, companyId))
  return row
}

async function setEnabled(
  fixture: ReturnType<typeof http>,
  isEnabled: boolean,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await fixture.handle(
    writeRequest({ body: { isEnabled }, method: 'PUT', path: PATH }),
  )
  return { body: await response.json(), status: response.status }
}

describe('o liga/desliga da importação da empresa (spec 262 CA6)', () => {
  testWithPostgres(
    'sem linha lê ligada; desligar cria a linha só com a flag e audita',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const admin = http(database, tenant, ['settings.manage'])

        const initial = await admin.handle(getRequest(PATH))
        expect(await initial.json()).toEqual({ data: { isEnabled: true, origin: 'default' } })

        const off = await setEnabled(admin, false)

        expect(off).toEqual({
          body: { data: { isEnabled: false, origin: 'company' } },
          status: 200,
        })
        expect(await readRow(database, tenant.companyId)).toEqual({
          companyId: tenant.companyId,
          cursorDocumentId: null,
          cursorIssuedAt: null,
          cursorUpdatedAt: null,
          isEnabled: false,
        })
        const [audit] = await readAudits(database, tenant.companyId)
        expect(audit).toMatchObject({
          action: 'holiday-import.enablement-changed',
          actorUserId: tenant.userId,
          entityId: tenant.companyId,
          entityType: 'company_holiday_import_settings',
          permission: 'settings.manage',
          targetId: tenant.companyId,
          targetType: 'company_holiday_import_settings',
        })
        expect(audit?.beforeSnapshot).toEqual({ isEnabled: true })
        expect(audit?.afterSnapshot).toEqual({ isEnabled: false })
        expect(audit?.metadata).toEqual({ ipAddress: CLIENT_IP })
      })
    },
  )

  testWithPostgres('o cursor de uma linha existente não muda, ligando ou desligando', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      await database.db.insert(companyHolidayImportSettings).values({
        companyId: tenant.companyId,
        cursorDocumentId: CURSOR_DOCUMENT_ID,
        cursorIssuedAt: CURSOR_AT,
        cursorUpdatedAt: CURSOR_AT,
      })
      const admin = http(database, tenant, ['settings.manage'])

      await setEnabled(admin, false)
      const off = await readRow(database, tenant.companyId)
      await setEnabled(admin, true)
      const on = await readRow(database, tenant.companyId)

      const cursor = {
        cursorDocumentId: CURSOR_DOCUMENT_ID,
        cursorIssuedAt: CURSOR_AT,
        cursorUpdatedAt: CURSOR_AT,
      }
      expect(off).toMatchObject({ ...cursor, isEnabled: false })
      expect(on).toMatchObject({ ...cursor, isEnabled: true })
    })
  })

  testWithPostgres('audita só quando o valor efetivo muda', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const admin = http(database, tenant, ['settings.manage'])

      await setEnabled(admin, true)
      expect(await readRow(database, tenant.companyId)).toBeUndefined()
      await setEnabled(admin, false)
      await setEnabled(admin, false)
      await setEnabled(admin, true)
      await setEnabled(admin, true)

      const audits = await readAudits(database, tenant.companyId)
      expect(audits.map((audit) => audit.afterSnapshot)).toEqual([
        { isEnabled: false },
        { isEnabled: true },
      ])
      expect(audits[1]?.beforeSnapshot).toEqual({ isEnabled: false })
    })
  })

  testWithPostgres('a empresa B não altera a A, e cada uma lê só a sua', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const companyA = await seedTenant(database)
      const companyB = await seedTenant(database)

      await setEnabled(http(database, companyB, ['settings.manage']), false)

      expect(await readRow(database, companyA.companyId)).toBeUndefined()
      const readA = await http(database, companyA, ['settings.manage']).handle(getRequest(PATH))
      const readB = await http(database, companyB, ['settings.manage']).handle(getRequest(PATH))
      expect(await readA.json()).toEqual({ data: { isEnabled: true, origin: 'default' } })
      expect(await readB.json()).toEqual({ data: { isEnabled: false, origin: 'company' } })
      expect(await readAudits(database, companyA.companyId)).toHaveLength(0)
      expect(await readAudits(database, companyB.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('recusa a empresa no corpo e quem só tem a permissão da chave', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const other = await seedTenant(database)
      const admin = http(database, tenant, ['settings.manage'])

      const smuggled = await admin.handle(
        writeRequest({
          body: { companyId: other.companyId, isEnabled: false },
          method: 'PUT',
          path: PATH,
        }),
      )
      const keyOnly = http(database, tenant, ['holiday-import.configure'])
      const forbidden = await keyOnly.handle(
        writeRequest({ body: { isEnabled: false }, method: 'PUT', path: PATH }),
      )

      expect([smuggled.status, forbidden.status]).toEqual([400, 403])
      expect(await readRow(database, tenant.companyId)).toBeUndefined()
      expect(await readRow(database, other.companyId)).toBeUndefined()
    })
  })

  testWithPostgres('a falha depois da auditoria desfaz a escrita', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const failing = {
        transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
          database.db.transaction(async (transaction) => {
            await callback(transaction)
            throw new Error('simulated failure after the audit insert')
          }),
      }

      await expect(
        new DrizzleHolidayImportEnablementRepository(failing as never).save({
          ...actorOf(tenant, 'c1'),
          isEnabled: false,
        }),
      ).rejects.toThrow('simulated failure')

      expect(await readRow(database, tenant.companyId)).toBeUndefined()
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})
