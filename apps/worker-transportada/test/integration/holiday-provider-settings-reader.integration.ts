/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.1 contra Postgres: o leitor da configuração da instalação. A linha é gravada como a API a grava
 * (envelope selado com o AAD do id da linha); o worker a abre com o chaveiro dele. Cobre: sem linha, linha sem
 * chave, chave selada pela cópia da API, orçamento NULL x definido, `keyId` fora do chaveiro e envelope malformado.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createHolidayProviderTokenSecretService } from '../../src/holiday-provider-pull/application/holiday-provider-token-secret.service.js'
import { FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET } from '../../src/holiday-provider-pull/domain/holiday-provider-pull.constant.js'
import { createDrizzleHolidayProviderSettingsReader } from '../../src/holiday-provider-pull/infrastructure/drizzle-holiday-provider-settings.reader.js'
import {
  FIXTURE_HOLIDAY_TOKEN,
  FOREIGN_PROVIDER,
  INSTALLATION_PROVIDER,
  sealLikeTheApiWould,
} from '../fixtures/holiday-provider-token-seal.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const ACTOR_ID = '00000000-0000-4000-8000-0000000000a1'

describeDatabase(
  'o leitor da chave e do orçamento da instalação (integration, spec 262 T4.1)',
  () => {
    const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
    const db = provider.db
    const reader = createDrizzleHolidayProviderSettingsReader({
      database: db,
      tokenSecret: createHolidayProviderTokenSecretService({
        envelopeProvider: INSTALLATION_PROVIDER,
      }),
    })

    beforeEach(async () => {
      await db.execute(sql`delete from holiday_provider_settings`)
    })

    afterAll(async () => {
      await provider.close()
    })

    async function insertSettings(input: {
      readonly budget?: number | null
      readonly envelope?: unknown
      readonly settingsId: string
    }) {
      const hasToken = input.envelope !== undefined
      await db.execute(sql`
      insert into holiday_provider_settings
        (id, token_envelope, token_hint, token_updated_at, monthly_request_budget, updated_by_user_id)
      values (
        ${input.settingsId},
        ${hasToken ? JSON.stringify(input.envelope) : null}::text::jsonb,
        ${hasToken ? 'Q7zK' : null},
        ${hasToken ? new Date().toISOString() : null}::timestamptz,
        ${input.budget ?? null},
        ${ACTOR_ID})`)
    }

    test('sem linha: sem chave e o orçamento é o padrão', async () => {
      expect(await reader.readAccess()).toEqual({
        budget: FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
        kind: 'token_missing',
      })
    })

    test('linha sem chave: sem chave, com o orçamento gravado', async () => {
      await insertSettings({ budget: 2500, settingsId: crypto.randomUUID() })

      expect(await reader.readAccess()).toEqual({ budget: 2500, kind: 'token_missing' })
    })

    test('chave selada como a API sela: pronta, e o orçamento NULL é o padrão', async () => {
      const settingsId = crypto.randomUUID()
      await insertSettings({ envelope: await sealLikeTheApiWould({ settingsId }), settingsId })

      expect(await reader.readAccess()).toEqual({
        budget: FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
        kind: 'ready',
        token: FIXTURE_HOLIDAY_TOKEN,
      })
    })

    test('chave selada com orçamento definido: o orçamento do banco vence o padrão', async () => {
      const settingsId = crypto.randomUUID()
      await insertSettings({
        budget: 300,
        envelope: await sealLikeTheApiWould({ settingsId }),
        settingsId,
      })

      expect(await reader.readAccess()).toMatchObject({ budget: 300, kind: 'ready' })
    })

    test('trocar a chave entre duas leituras: a segunda enxerga a nova', async () => {
      const settingsId = crypto.randomUUID()
      await insertSettings({ envelope: await sealLikeTheApiWould({ settingsId }), settingsId })
      const first = await reader.readAccess()
      const renewed = await sealLikeTheApiWould({
        settingsId,
        token: 'FAKE-renewed-key-Q7zK-9876543210',
      })
      await db.execute(sql`
      update holiday_provider_settings set token_envelope = ${JSON.stringify(renewed)}::text::jsonb`)

      expect(first).toMatchObject({ kind: 'ready', token: FIXTURE_HOLIDAY_TOKEN })
      expect(await reader.readAccess()).toMatchObject({
        kind: 'ready',
        token: 'FAKE-renewed-key-Q7zK-9876543210',
      })
    })

    test('envelope com `keyId` fora do chaveiro: chave ilegível, sem a chave nem o envelope no resultado', async () => {
      const settingsId = crypto.randomUUID()
      const envelope = await sealLikeTheApiWould({ provider: FOREIGN_PROVIDER, settingsId })
      await insertSettings({ envelope, settingsId })

      const access = await reader.readAccess()

      expect(access).toEqual({ kind: 'token_unreadable' })
      expect(JSON.stringify(access)).not.toContain(envelope.ciphertext)
    })

    test('envelope selado para o id de outra linha: chave ilegível', async () => {
      const settingsId = crypto.randomUUID()
      const envelope = await sealLikeTheApiWould({ settingsId: crypto.randomUUID() })
      await insertSettings({ envelope, settingsId })

      expect(await reader.readAccess()).toEqual({ kind: 'token_unreadable' })
    })

    test('envelope malformado (objeto que a CHECK aceita, mas que não é envelope): chave ilegível', async () => {
      const settingsId = crypto.randomUUID()
      await insertSettings({
        envelope: { algorithm: 'rot13', note: 'not an envelope' },
        settingsId,
      })

      expect(await reader.readAccess()).toEqual({ kind: 'token_unreadable' })
    })

    test('erro de banco propaga: não é chave ilegível, é falha da etapa', async () => {
      const unreachable = createDrizzleProvider({
        connection: 'postgres://nobody@127.0.0.1:1/none',
      })
      const brokenReader = createDrizzleHolidayProviderSettingsReader({
        database: unreachable.db,
        tokenSecret: createHolidayProviderTokenSecretService({
          envelopeProvider: INSTALLATION_PROVIDER,
        }),
      })

      await expect(brokenReader.readAccess()).rejects.toThrow()
      await unreachable.close()
    })
  },
)
