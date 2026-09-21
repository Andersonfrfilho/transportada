/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **O cliente da API não é o dos testes, e a diferença escondeu um defeito de produção.**
 * `createDatabaseProvider` usa `prepare: false` (spec 137, contra consultas que nunca resolviam sob
 * carga); as suítes usam `createDrizzleProvider`, com preparo. Sem preparo o Bun SQL não pergunta
 * ao Postgres o tipo do parâmetro e converte com `String()` — uma `Date` numa comparação em SQL cru
 * vira `Tue Jun 23 2026 18:40:41 GMT+0000 (...)` e o Postgres recusa com `22007`.
 *
 * Medido em staging (2026-09-21): `GET /fleet/drivers` respondia 500 e o detalhe da viagem não
 * carregava, enquanto a suíte inteira passava. Este teste fecha essa distância: exercita o cliente
 * **da aplicação** contra Postgres de verdade.
 */
import { describe, expect, test } from 'bun:test'
import { sql as drizzleSql } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

const POOL = { connectTimeoutSeconds: 5, max: 1, queryTimeoutMs: 10_000 }

describeDatabase('parâmetro de data pelo cliente da aplicação (prepare: false)', () => {
  test('uma Date numa comparação em SQL cru é aceita pelo Postgres', async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    const provider = createDatabaseProvider({ pool: POOL, url: databaseUrl })
    const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    try {
      const rows = await provider.db.execute(
        drizzleSql`select 1 as ok where coalesce(now(), now()) >= ${windowStart}`,
      )

      expect(rows.length).toBe(1)
    } finally {
      await provider.close()
    }
  })
})
