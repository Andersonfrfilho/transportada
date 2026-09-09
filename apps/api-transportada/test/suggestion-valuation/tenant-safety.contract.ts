/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildSuggestionVehicleRoadFilters } from '../../src/routing/infrastructure/suggestion-vehicle-road.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000902'

const dialect = new PgDialect()

describe('suggestion vehicle road query tenant safety (spec 101)', () => {
  /**
   * ⚠️ Sugestão de outra empresa é **ausência**, nunca 403: o id não é adivinhável e responder
   * "existe, mas não é sua" já entrega que ela existe. Mesma regra da chave de acesso.
   */
  test('prende as paradas à empresa do contexto', () => {
    const query = dialect.sqlToQuery(
      and(
        ...buildSuggestionVehicleRoadFilters({
          companyId: COMPANY_ID,
          suggestionId: SUGGESTION_ID,
        }),
      )!,
    )

    expect(query.sql).toContain('"route_suggestion_stops"."company_id" = $')
    expect(query.sql).toContain('"route_suggestion_stops"."suggestion_id" = $')
    expect(query.params).toContain(COMPANY_ID)
    expect(query.params).toContain(SUGGESTION_ID)
  })

  /**
   * A parada sem veículo é a que ficou fora da otimização, esperando decisão humana (ADR-0044 §5).
   * Ela não pertence a viagem proposta nenhuma, e somá-la a alguma inventaria custo.
   */
  test('descarta a parada que não foi atribuída a veículo', () => {
    const query = dialect.sqlToQuery(
      and(
        ...buildSuggestionVehicleRoadFilters({
          companyId: COMPANY_ID,
          suggestionId: SUGGESTION_ID,
        }),
      )!,
    )

    expect(query.sql).toContain('"route_suggestion_stops"."vehicle_id" is not null')
  })
})
