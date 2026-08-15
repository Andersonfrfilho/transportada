/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { COMPANY_ID } from '../fixtures/nfse-callbacks-http.fixture'
import {
  buildActiveCallbackCredentialFilters,
  buildCallbackAnticipationFilters,
} from '../../src/nfse-callbacks/infrastructure/nfse-callback.query'

const dialect = new PgDialect()

function render(filters: readonly unknown[]): { params: unknown[]; sql: string } {
  const condition = and(...(filters as Parameters<typeof and>))
  expect(condition).toBeDefined()
  const query = dialect.sqlToQuery(condition!)
  return { params: [...query.params], sql: query.sql }
}

describe('nfse callback query tenant safety contract', () => {
  test('a antecipação é presa à empresa do token, e o filtro de empresa vem parametrizado', () => {
    const { params, sql } = render(buildCallbackAnticipationFilters({ companyId: COMPANY_ID }))

    expect(sql).toContain('"nfse_service_invoices"."company_id" = ')
    expect(params).toContain(COMPANY_ID)
  })

  test('só toca nota que já estava agendada e ainda não venceu — nada de ressuscitar liquidada', () => {
    const { sql } = render(buildCallbackAnticipationFilters({ companyId: COMPANY_ID }))

    expect(sql).toContain('"nfse_service_invoices"."status"')
    expect(sql).toContain('"nfse_service_invoices"."next_status_check_at" is not null')
    expect(sql).toContain('"nfse_service_invoices"."next_status_check_at" >')
  })

  test('os estados antecipados são exatamente os que o check da tabela deixa agendar', async () => {
    const { params } = render(buildCallbackAnticipationFilters({ companyId: COMPANY_ID }))
    const schema = await Bun.file(
      new URL('../../src/database/nfse.schema.ts', import.meta.url),
    ).text()

    expect(params).toContain('pending_authorization')
    expect(params).toContain('cancellation_requested')
    expect(params).not.toContain('authorized')
    expect(params).not.toContain('cancelled')
    expect(schema).toContain(
      "in ('pending_authorization', 'cancellation_requested') or ${table.nextStatusCheckAt} is null",
    )
  })

  test('a busca de credencial não filtra por empresa — é ela que descobre a empresa', () => {
    const { params, sql } = render(buildActiveCallbackCredentialFilters())

    expect(sql).toContain('"nfse_provider_credentials"."status" = ')
    expect(sql).not.toContain('"nfse_provider_credentials"."company_id"')
    expect(params).toEqual(['active'])
  })

  test('o token nunca vira predicado de SQL — quem compara é a política, em tempo constante', async () => {
    const query = await Bun.file(
      new URL('../../src/nfse-callbacks/infrastructure/nfse-callback.query.ts', import.meta.url),
    ).text()
    const repository = await Bun.file(
      new URL(
        '../../src/nfse-callbacks/infrastructure/drizzle-nfse-callback.repository.ts',
        import.meta.url,
      ),
    ).text()

    expect(query).not.toContain('sql.raw')
    expect(repository).not.toContain('sql.raw')
    // `where callback_token_sha256 = $1` devolveria a comparação ao Postgres, que não é timing-safe.
    expect(query).not.toMatch(/eq\(\s*nfseProviderCredentials\.callbackTokenSha256/)
    expect(repository).not.toMatch(/eq\(\s*nfseProviderCredentials\.callbackTokenSha256/)
  })
})
