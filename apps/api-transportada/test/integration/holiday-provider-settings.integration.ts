/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.3 (CA2–CA5): a chave da FeriadosAPI contra Postgres de verdade, pelo roteador de verdade. A
 * concorrência por versão, o envelope que só abre com o AAD da linha, a auditoria na mesma transação e a chave
 * sentinela procurada em resposta, log e em todas as colunas de `audit_logs`.
 */
import { describe, expect, test } from 'bun:test'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { createHolidayProviderSettingsUseCases } from '../../src/business-calendar/application/holiday-provider-settings.use-case.js'
import { createHolidayProviderTokenSecretService } from '../../src/business-calendar/application/holiday-provider-token-secret.service.js'
import { DrizzleHolidayProviderSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-provider-settings.repository.js'
import { holidayProviderSettings } from '../../src/database/database.schema.js'
import { DrizzleRateLimiterRepository } from '../../src/http/drizzle-rate-limiter.repository.js'
import {
  CLIENT_IP,
  CONFIGURE_PERMISSIONS,
  PROVIDER_SETTINGS_PATH,
  PROVIDER_TOKEN_PATH,
  createHolidayProviderSettingsHttpFixture,
  getRequest,
  writeRequest,
} from '../fixtures/holiday-provider-settings-http.fixture.js'
import {
  actorOf,
  databaseUrl,
  readAudits,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test

/** Obviamente falsa; os 4 últimos (`Q7zK`) não aparecem em nenhum outro lugar de uma linha de auditoria. */
const TOKEN = 'FAKE-feriadosapi-key-do-not-leak-Q7zK'
const HINT = 'Q7zK'
const OTHER_TOKEN = 'FAKE-feriadosapi-second-key-Zm4P'

const envelopeProvider = createSecretEnvelopeProvider({
  activeKeyId: 'test-v1',
  keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
})
const secrets = createHolidayProviderTokenSecretService({ envelopeProvider })

async function withHarness(
  operation: (harness: Harness) => Promise<void>,
  options: { readonly realLimiter?: boolean } = {},
): Promise<void> {
  await withBusinessCalendarDatabase(async (database) => {
    const tenant = await seedTenant(database)
    const otherTenant = await seedTenant(database)
    const repository = new DrizzleHolidayProviderSettingsRepository(database.db)
    const useCases = createHolidayProviderSettingsUseCases({ port: repository, secrets })
    const rateLimitWindows = options.realLimiter
      ? new DrizzleRateLimiterRepository(database.db)
      : undefined
    const http = (tenantOf: typeof tenant, permissions: readonly string[]) =>
      createHolidayProviderSettingsHttpFixture({
        companyId: tenantOf.companyId,
        permissions,
        ...(rateLimitWindows === undefined ? {} : { rateLimitWindows }),
        useCases,
        userId: tenantOf.userId,
      })

    await operation({ database, http, otherTenant, repository, tenant, useCases })
  })
}

type Harness = {
  readonly database: TestDatabase
  readonly http: (
    tenant: { readonly companyId: string; readonly userId: string },
    permissions: readonly string[],
  ) => ReturnType<typeof createHolidayProviderSettingsHttpFixture>
  readonly otherTenant: { readonly companyId: string; readonly userId: string }
  readonly repository: DrizzleHolidayProviderSettingsRepository
  readonly tenant: { readonly companyId: string; readonly userId: string }
  readonly useCases: ReturnType<typeof createHolidayProviderSettingsUseCases>
}

async function readRows(database: TestDatabase) {
  return database.db.select().from(holidayProviderSettings)
}

async function put(
  http: ReturnType<typeof createHolidayProviderSettingsHttpFixture>,
  body: unknown,
): Promise<{ readonly status: number; readonly text: string }> {
  const response = await http.handle(
    writeRequest({ body, method: 'PUT', path: PROVIDER_SETTINGS_PATH }),
  )
  return { status: response.status, text: await response.text() }
}

describe('a configuração da instalação — leitura (spec 262 CA2)', () => {
  testWithPostgres('sem linha devolve o padrão; com linha, a dica e nunca a chave', async () => {
    await withHarness(async ({ http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)

      const empty = await admin.handle(getRequest(PROVIDER_SETTINGS_PATH))
      expect(await empty.json()).toMatchObject({
        data: { budgetOrigin: 'default', monthlyRequestBudget: 4500, tokenConfigured: false },
      })

      await put(admin, { token: TOKEN })
      const configured = await admin.handle(getRequest(PROVIDER_SETTINGS_PATH))
      const text = await configured.text()

      expect(JSON.parse(text)).toMatchObject({
        data: {
          budgetOrigin: 'default',
          monthlyRequestBudget: 4500,
          tokenConfigured: true,
          tokenHint: HINT,
          version: '1',
        },
      })
      expect(text).not.toContain(TOKEN)
      expect(text.toLowerCase()).not.toContain('ciphertext')
    })
  })

  testWithPostgres('a empresa B lê a configuração que a A gravou, sem quem a gravou', async () => {
    await withHarness(async ({ http, otherTenant, tenant }) => {
      await put(http(tenant, CONFIGURE_PERMISSIONS), { token: TOKEN })

      const response = await http(otherTenant, ['settings.manage']).handle(
        getRequest(PROVIDER_SETTINGS_PATH),
      )
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(JSON.parse(text)).toMatchObject({ data: { tokenConfigured: true, tokenHint: HINT } })
      expect(text).not.toContain(tenant.userId)
      expect(text).not.toContain(tenant.companyId)
    })
  })
})

describe('a chave selada (spec 262 CA4)', () => {
  testWithPostgres(
    'o envelope gravado abre com o AAD da linha e não abre com o de outro id',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        await put(http(tenant, CONFIGURE_PERMISSIONS), { token: TOKEN })

        const [row] = await readRows(database)
        expect(row).toMatchObject({ tokenHint: HINT, updatedByUserId: tenant.userId, version: 1n })
        expect(row?.tokenUpdatedAt).toBeInstanceOf(Date)
        expect(
          await secrets.decrypt({ envelope: row?.tokenEnvelope, settingsId: row?.id ?? '' }),
        ).toBe(TOKEN)
        await expect(
          secrets.decrypt({ envelope: row?.tokenEnvelope, settingsId: crypto.randomUUID() }),
        ).rejects.toMatchObject({ code: 'HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE' })
        expect(JSON.stringify(row?.tokenEnvelope)).not.toContain(TOKEN)
      })
    },
  )

  testWithPostgres(
    'a chave sentinela não aparece em resposta, log nem em nenhuma coluna de audit_logs',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)
        await put(admin, { monthlyRequestBudget: 100 })
        const responses = [
          await put(admin, { expectedVersion: '1', token: TOKEN }),
          await put(admin, { expectedVersion: '1', token: OTHER_TOKEN }),
          await put(admin, { expectedVersion: '2', token: `ruim ${TOKEN}` }),
          await put(admin, { expectedVersion: '2', monthlyRequestBudget: 0, token: TOKEN }),
          await put(admin, { companyId: tenant.companyId, token: TOKEN }),
          await put(admin, { expectedVersion: '2', monthlyRequestBudget: 300, token: OTHER_TOKEN }),
        ]
        await admin.handle(writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }))
        responses.push({
          status: 0,
          text: await (await admin.handle(getRequest(PROVIDER_SETTINGS_PATH))).text(),
        })

        const audits = await readAudits(database, tenant.companyId)
        const serialize = (value: unknown): string =>
          JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? `${item}` : item))
        // A dica (4 últimos caracteres) é para a tela, então a resposta a leva; log e auditoria, nunca.
        const everywhere = serialize([responses, admin.logs, audits])
        const quietPlaces = serialize([admin.logs, audits])

        expect(everywhere).not.toContain(TOKEN)
        expect(everywhere).not.toContain(OTHER_TOKEN)
        expect(everywhere.toLowerCase()).not.toContain('ciphertext')
        expect(quietPlaces).not.toContain(HINT)
        expect(quietPlaces).not.toContain('Zm4P')
        expect(audits.length).toBeGreaterThan(0)
        expect(await readRows(database)).toHaveLength(1)
      })
    },
  )
})

describe('a escrita e a auditoria (spec 262 CA3, CA4)', () => {
  testWithPostgres(
    'criar audita com ator, alvo, IP e permissão dedicada, sem chave nem dica',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        await put(http(tenant, CONFIGURE_PERMISSIONS), { monthlyRequestBudget: 2500, token: TOKEN })

        const [row] = await readRows(database)
        const [audit] = await readAudits(database, tenant.companyId)
        expect(audit).toMatchObject({
          action: 'holiday-provider-settings.saved',
          actorUserId: tenant.userId,
          entityId: row?.id,
          entityType: 'holiday_provider_settings',
          permission: 'holiday-import.configure',
          targetId: row?.id,
          targetType: 'holiday_provider_settings',
        })
        expect(audit?.beforeSnapshot).toBeNull()
        expect(audit?.afterSnapshot).toEqual({
          monthlyRequestBudget: 2500,
          tokenConfigured: true,
          version: '1',
        })
        expect(audit?.metadata).toEqual({
          changedFields: ['monthlyRequestBudget', 'token'],
          ipAddress: CLIENT_IP,
        })
      })
    },
  )

  testWithPostgres('versão velha é 409 e nada muda; versão certa sobe a versão', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)
      await put(admin, { token: TOKEN })
      const [before] = await readRows(database)

      const stale = await put(admin, { expectedVersion: '7', monthlyRequestBudget: 100 })
      const missingVersion = await put(admin, { monthlyRequestBudget: 100 })
      const [untouched] = await readRows(database)

      expect(stale.status).toBe(409)
      expect(missingVersion.status).toBe(409)
      expect(untouched).toEqual(before)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)

      const fresh = await put(admin, { expectedVersion: '1', monthlyRequestBudget: 100 })
      const [after] = await readRows(database)

      expect(fresh.status).toBe(200)
      expect(after).toMatchObject({ monthlyRequestBudget: 100, version: 2n })
      expect(after?.tokenEnvelope).toEqual(before?.tokenEnvelope)
    })
  })

  testWithPostgres('criar de novo é 409, e o envelope recém-selado é descartado', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)
      await put(admin, { token: TOKEN })
      const [first] = await readRows(database)

      const second = await put(admin, { token: OTHER_TOKEN })
      const rows = await readRows(database)

      expect(second.status).toBe(409)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toEqual(first)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres(
    'duas criações ao mesmo tempo: uma vence, a outra leva 409, uma linha só',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)

        const results = await Promise.all([
          put(admin, { token: TOKEN }),
          put(admin, { token: OTHER_TOKEN }),
        ])

        expect(results.map((result) => result.status).sort()).toEqual([200, 409])
        const rows = await readRows(database)
        expect(rows).toHaveLength(1)
        const [winner] = rows
        const opened = await secrets.decrypt({
          envelope: winner?.tokenEnvelope,
          settingsId: winner?.id ?? '',
        })
        expect([TOKEN, OTHER_TOKEN]).toContain(opened)
        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres('salvar a mesma configuração não grava nem audita', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)
      await put(admin, { monthlyRequestBudget: 2500, token: TOKEN })
      const [before] = await readRows(database)

      const same = await put(admin, { expectedVersion: '1', monthlyRequestBudget: 2500 })
      const [after] = await readRows(database)

      expect(same.status).toBe(200)
      expect(JSON.parse(same.text)).toMatchObject({ data: { version: '1' } })
      expect(after).toEqual(before)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres(
    'trocar só o orçamento guarda a chave; trocar só a chave guarda o orçamento',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)
        await put(admin, { monthlyRequestBudget: 2500, token: TOKEN })
        const [created] = await readRows(database)

        await put(admin, { expectedVersion: '1', monthlyRequestBudget: 900 })
        const [budgetOnly] = await readRows(database)
        await put(admin, { expectedVersion: '2', token: OTHER_TOKEN })
        const [tokenOnly] = await readRows(database)

        expect(budgetOnly?.tokenEnvelope).toEqual(created?.tokenEnvelope)
        expect(tokenOnly).toMatchObject({
          monthlyRequestBudget: 900,
          tokenHint: 'Zm4P',
          version: 3n,
        })
        expect(tokenOnly?.tokenEnvelope).not.toEqual(created?.tokenEnvelope)
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.map((audit) => audit.metadata)).toEqual([
          { changedFields: ['monthlyRequestBudget', 'token'], ipAddress: CLIENT_IP },
          { changedFields: ['monthlyRequestBudget'], ipAddress: CLIENT_IP },
          { changedFields: ['token'], ipAddress: CLIENT_IP },
        ])
      })
    },
  )

  testWithPostgres('a falha depois da auditoria desfaz a escrita', async () => {
    await withHarness(async ({ database, tenant }) => {
      const failing = {
        transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
          database.db.transaction(async (transaction) => {
            await callback(transaction)
            throw new Error('simulated failure after the audit insert')
          }),
      }
      const settingsId = crypto.randomUUID()
      const envelope = await secrets.encrypt({ settingsId, token: TOKEN })

      await expect(
        new DrizzleHolidayProviderSettingsRepository(failing as never).save({
          ...actorOf(tenant, 'c1'),
          expectedVersion: undefined,
          monthlyRequestBudget: 100,
          sealedToken: { envelope, hint: HINT },
          settingsId,
        }),
      ).rejects.toThrow('simulated failure')

      expect(await readRows(database)).toHaveLength(0)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})

describe('remover a chave (spec 262 CA5)', () => {
  testWithPostgres(
    'zera envelope, dica e data juntos, sobe a versão, audita e guarda o orçamento',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)
        await put(admin, { monthlyRequestBudget: 2500, token: TOKEN })

        const removed = await admin.handle(
          writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }),
        )

        expect(removed.status).toBe(204)
        const [row] = await readRows(database)
        expect(row).toMatchObject({
          monthlyRequestBudget: 2500,
          tokenEnvelope: null,
          tokenHint: null,
          tokenUpdatedAt: null,
          version: 2n,
        })
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.at(-1)).toMatchObject({
          action: 'holiday-provider-settings.token-removed',
          entityId: row?.id,
          permission: 'holiday-import.configure',
        })
        expect(audits.at(-1)?.beforeSnapshot).toEqual({
          monthlyRequestBudget: 2500,
          tokenConfigured: true,
          version: '1',
        })
        expect(audits.at(-1)?.afterSnapshot).toEqual({
          monthlyRequestBudget: 2500,
          tokenConfigured: false,
          version: '2',
        })
      })
    },
  )

  testWithPostgres('repetir é 204 sem auditoria nova; sem linha também', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)
      const withoutRow = await admin.handle(
        writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }),
      )
      await put(admin, { token: TOKEN })
      await admin.handle(writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }))
      const [afterFirst] = await readRows(database)

      const again = await admin.handle(
        writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }),
      )
      const [afterSecond] = await readRows(database)

      expect([withoutRow.status, again.status]).toEqual([204, 204])
      expect(afterSecond).toEqual(afterFirst)
      expect((await readAudits(database, tenant.companyId)).map((audit) => audit.action)).toEqual([
        'holiday-provider-settings.saved',
        'holiday-provider-settings.token-removed',
      ])
    })
  })

  testWithPostgres('quem só tem settings.manage recebe 403 e nada é gravado', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const reader = http(tenant, ['settings.manage'])

      const created = await put(reader, { token: TOKEN })
      const removed = await reader.handle(
        writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }),
      )

      expect([created.status, removed.status]).toEqual([403, 403])
      expect(await readRows(database)).toHaveLength(0)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})

describe('o limitador de verdade (spec 262 CA3)', () => {
  testWithPostgres('o 11º pedido da hora é 429, inclusive com corpo inválido', async () => {
    await withHarness(
      async ({ http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)

        const statuses: number[] = []
        for (let attempt = 0; attempt < 11; attempt += 1) {
          statuses.push((await put(admin, {})).status)
        }

        expect(statuses.slice(0, 10)).toEqual(new Array<number>(10).fill(400))
        expect(statuses[10]).toBe(429)
      },
      { realLimiter: true },
    )
  })
})

describe('o orçamento nulo é o padrão (spec 262 M1)', () => {
  testWithPostgres(
    'o primeiro PUT com a chave não grava orçamento: fica NULL e a origem é o padrão',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)

        const created = await put(admin, { token: TOKEN })

        expect(JSON.parse(created.text)).toMatchObject({
          data: { budgetOrigin: 'default', monthlyRequestBudget: 4500, tokenConfigured: true },
        })
        const [row] = await readRows(database)
        expect(row?.monthlyRequestBudget).toBeNull()
        const [audit] = await readAudits(database, tenant.companyId)
        expect(audit?.afterSnapshot).toEqual({
          monthlyRequestBudget: null,
          tokenConfigured: true,
          version: '1',
        })
        expect(audit?.metadata).toEqual({ changedFields: ['token'], ipAddress: CLIENT_IP })
      })
    },
  )

  testWithPostgres(
    'definir o orçamento é da instalação; null volta ao padrão; repetir o null é no-op',
    async () => {
      await withHarness(async ({ database, http, tenant }) => {
        const admin = http(tenant, CONFIGURE_PERMISSIONS)
        await put(admin, { token: TOKEN })

        const defined = await put(admin, { expectedVersion: '1', monthlyRequestBudget: 2500 })
        const reset = await put(admin, { expectedVersion: '2', monthlyRequestBudget: null })
        const [afterReset] = await readRows(database)
        const again = await put(admin, { expectedVersion: '3', monthlyRequestBudget: null })
        const [afterAgain] = await readRows(database)

        expect(JSON.parse(defined.text)).toMatchObject({
          data: { budgetOrigin: 'installation', monthlyRequestBudget: 2500 },
        })
        expect(JSON.parse(reset.text)).toMatchObject({
          data: { budgetOrigin: 'default', monthlyRequestBudget: 4500, version: '3' },
        })
        expect(afterReset).toMatchObject({ monthlyRequestBudget: null, version: 3n })
        expect(again.status).toBe(200)
        expect(afterAgain).toEqual(afterReset)
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.map((audit) => audit.metadata)).toEqual([
          { changedFields: ['token'], ipAddress: CLIENT_IP },
          { changedFields: ['monthlyRequestBudget'], ipAddress: CLIENT_IP },
          { changedFields: ['monthlyRequestBudget'], ipAddress: CLIENT_IP },
        ])
        expect(audits[2]?.beforeSnapshot).toMatchObject({ monthlyRequestBudget: 2500 })
        expect(audits[2]?.afterSnapshot).toMatchObject({ monthlyRequestBudget: null })
      })
    },
  )
})

describe('a corrida de atualização e a chave da instalação (spec 262 revisão)', () => {
  testWithPostgres('dois PUT com a mesma versão: um 200, um 409, uma auditoria só', async () => {
    await withHarness(async ({ database, http, tenant }) => {
      const admin = http(tenant, CONFIGURE_PERMISSIONS)
      await put(admin, { token: TOKEN })

      const results = await Promise.all([
        put(admin, { expectedVersion: '1', monthlyRequestBudget: 100 }),
        put(admin, { expectedVersion: '1', monthlyRequestBudget: 200 }),
      ])

      expect(results.map((result) => result.status).sort()).toEqual([200, 409])
      const [row] = await readRows(database)
      expect(row?.version).toBe(2n)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(2)
    })
  })

  /**
   * Decisão prendida (ADR-0102 D6 e Riscos): a chave é da INSTALAÇÃO, então o administrador de QUALQUER empresa com
   * a permissão dedicada a sobrescreve; a trilha cai na empresa DELE e a linha guarda quem foi. A empresa dona da
   * criação não é avisada por rota nenhuma — é o risco aceito pelo ADR-0021 (um dono por instalação).
   */
  testWithPostgres(
    'o administrador da empresa B sobrescreve a chave e a auditoria cai em B',
    async () => {
      await withHarness(async ({ database, http, otherTenant, tenant }) => {
        await put(http(tenant, CONFIGURE_PERMISSIONS), { token: TOKEN })

        const overwritten = await put(http(otherTenant, CONFIGURE_PERMISSIONS), {
          expectedVersion: '1',
          token: OTHER_TOKEN,
        })

        expect(overwritten.status).toBe(200)
        const [row] = await readRows(database)
        expect(row).toMatchObject({
          tokenHint: 'Zm4P',
          updatedByUserId: otherTenant.userId,
          version: 2n,
        })
        expect(
          await secrets.decrypt({ envelope: row?.tokenEnvelope, settingsId: row?.id ?? '' }),
        ).toBe(OTHER_TOKEN)
        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
        const [auditInB] = await readAudits(database, otherTenant.companyId)
        expect(auditInB).toMatchObject({
          action: 'holiday-provider-settings.saved',
          actorUserId: otherTenant.userId,
          permission: 'holiday-import.configure',
        })
        expect(auditInB?.metadata).toEqual({ changedFields: ['token'], ipAddress: CLIENT_IP })
      })
    },
  )
})
