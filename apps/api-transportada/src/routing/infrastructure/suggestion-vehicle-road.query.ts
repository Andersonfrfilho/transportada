/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 101 D1: **a distância de cada viagem proposta sai das paradas que o solver já escolheu**,
 * nunca de uma segunda consulta ao roteirizador. Duas consultas para o mesmo trajeto podem devolver
 * caminhos diferentes, e a tela desenharia um roteiro e cobraria outro — os dois plausíveis. É a
 * mesma regra que a spec 090 D4 fixou para o pedágio, um nível acima.
 */
import { and, eq, isNotNull } from 'drizzle-orm'

import { routeSuggestionStops } from '../../database/database.schema.js'

export type SuggestionVehicleRoadQuery = {
  readonly companyId: string
  readonly suggestionId: string
}

/**
 * Extraído como função para o contrato compilar o SQL e afirmar o recorte — a junção inteira
 * compilaria igual com o `company_id` faltando, e é justamente isso que não pode passar.
 *
 * ⚠️ `vehicle_id is not null` descarta a parada que ficou **fora da otimização**, esperando decisão
 * humana (ADR-0044 §5): ela não pertence a viagem proposta nenhuma, e atribuí-la a alguma
 * inventaria custo para um caminhão que não vai lá.
 */
export function buildSuggestionVehicleRoadFilters(input: SuggestionVehicleRoadQuery) {
  return [
    eq(routeSuggestionStops.companyId, input.companyId),
    eq(routeSuggestionStops.suggestionId, input.suggestionId),
    isNotNull(routeSuggestionStops.vehicleId),
  ]
}

export function buildSuggestionVehicleRoadWhere(input: SuggestionVehicleRoadQuery) {
  return and(...buildSuggestionVehicleRoadFilters(input))
}
