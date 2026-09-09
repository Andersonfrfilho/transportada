/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildCancelReleaseFilters } from '../../src/trips/infrastructure/cancel-release.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

const dialect = new PgDialect()
const REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-trip-route.repository.ts',
  import.meta.url,
)

function sqlOf() {
  return dialect.sqlToQuery(
    and(...buildCancelReleaseFilters({ companyId: COMPANY_ID, tripId: TRIP_ID }))!,
  )
}

describe('a liberação do cancelamento (spec 102)', () => {
  test('prende a escrita à empresa e à viagem do contexto', () => {
    const query = sqlOf()

    expect(query.sql).toContain('"trip_documents"."company_id" = $')
    expect(query.sql).toContain('"trip_documents"."trip_id" = $')
    expect(query.params).toContain(COMPANY_ID)
    expect(query.params).toContain(TRIP_ID)
  })

  /**
   * ⚠️ **Nota entregue não volta ao pool.** Ela chegou ao destino; devolvê-la a ofereceria para uma
   * segunda entrega da mesma carga.
   */
  test('não libera nota já entregue', () => {
    expect(sqlOf().sql).toContain('"trip_documents"."delivered_at" is null')
  })

  /** Nota já solta não é tocada de novo: `released_at` guarda **quando** ela saiu. */
  test('não reescreve nota já liberada', () => {
    expect(sqlOf().sql).toContain('"trip_documents"."released_at" is null')
  })

  /**
   * ⚠️ **D1: liberar é marcar, nunca apagar.** A linha é a única prova de que aquela nota chegou a
   * ser carregada nesta viagem — é ela que atende "deixe no histórico da nota". Um `delete` aqui
   * destruiria o histórico enquanto os testes de disponibilidade continuariam passando.
   */
  test('a persistência marca a linha, e não a apaga', () => {
    const source = readFileSync(REPOSITORY, 'utf8')
    const trecho = source.slice(source.indexOf('markCancelled'))
    const corpo = trecho.slice(0, trecho.indexOf('\n  public async', 1))

    expect(corpo).toInclude('releasedAt')
    expect(corpo).not.toInclude('.delete(')
  })

  /**
   * ⚠️ D2: o status da viagem e a soltura da carga vão na **mesma** transação. Uma falha no meio
   * deixaria a viagem cancelada com a carga presa — exatamente o defeito que esta spec corrige.
   */
  test('status e carga mudam na mesma transação', () => {
    const source = readFileSync(REPOSITORY, 'utf8')
    const trecho = source.slice(source.indexOf('markCancelled'))
    const corpo = trecho.slice(0, trecho.indexOf('\n  public async', 1))

    expect(corpo).toInclude('transaction')
  })
})
