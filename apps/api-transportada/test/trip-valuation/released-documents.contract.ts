/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Nota liberada saiu da viagem: a leitura do valor a ignora, salvo na viagem cancelada (que libera
 * todas as notas ao cancelar e segue mostrando o que valia).
 */
import { describe, expect, it } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

import { excludesReleasedDocumentsUnlessCancelled } from '../../src/trips/infrastructure/trip-valuation.query.js'

describe('a conta da viagem ignora a nota liberada', () => {
  const { sql: text } = new PgDialect().sqlToQuery(excludesReleasedDocumentsUnlessCancelled())

  it('deixa passar só a nota não liberada', () => {
    expect(text).toContain('"trip_documents"."released_at" is null')
  })

  it('mantém a nota liberada apenas quando a viagem está cancelada', () => {
    expect(text).toContain('"trips"."status" = \'cancelled\'')
    expect(text).toContain('"trips"."company_id" = "trip_documents"."company_id"')
    expect(text).toContain('"trips"."id" = "trip_documents"."trip_id"')
  })
})
