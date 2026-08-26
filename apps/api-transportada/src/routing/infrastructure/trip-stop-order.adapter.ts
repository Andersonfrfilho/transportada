/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  reorderTripStops,
  type ReorderTripStopsPort,
} from '../../trips/application/reorder-trip-stops.use-case.js'
import type { StopOrderWriter } from '../application/route-suggestion.use-case.js'

/**
 * ADR-0044 §5: o aceite escreve pela **mesma rota da 056**, e isto é o que garante a frase. O
 * adaptador chama `reorderTripStops` — o caso de uso —, não o repositório por baixo dele.
 *
 * A diferença importa: o caso de uso é quem verifica a porta de não-retorno e quem exige que o
 * conjunto de paradas bata exatamente. Chamando o repositório direto, o roteirizador teria um
 * caminho de escrita que pula as duas regras, e seria o único no sistema a fazê-lo.
 */
export function createTripStopOrderWriter(repository: ReorderTripStopsPort): StopOrderWriter {
  return {
    async reorder({ companyId, orderedStopIds, tripId }) {
      await reorderTripStops({ companyId, orderedStopIds, repository, tripId })
    },
  }
}
