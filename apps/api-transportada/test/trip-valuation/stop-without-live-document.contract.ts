/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Parada sem nota viva não entra nas coordenadas do roteiro: o endereço dela, sem ponto no mapa,
 * derrubava o `plan-route` da viagem inteira.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

import { stopHasLiveDocument } from '../../src/trips/infrastructure/trip-stop-coordinates.support.js'

describe('a parada sem nota viva fica fora das coordenadas do roteiro', () => {
  const { sql: text } = new PgDialect().sqlToQuery(stopHasLiveDocument())

  it('exige ao menos uma nota da parada que não foi liberada', () => {
    expect(text).toContain('"trip_documents"."stop_id" = "trip_stops"."id"')
    expect(text).toContain('"trip_documents"."released_at" is null')
    expect(text).toContain('"trip_documents"."company_id" = "trip_stops"."company_id"')
  })

  it('a consulta de coordenadas aplica o filtro', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/trip-stop-coordinates.support.ts', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(/\.where\([\s\S]*?stopHasLiveDocument\(\)/)
  })
})
