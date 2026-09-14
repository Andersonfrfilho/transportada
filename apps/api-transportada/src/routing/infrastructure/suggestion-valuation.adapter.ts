/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 101: junta as duas metades que a conta da sugestão precisa — o agrupamento por veículo, que
 * é do roteirizador, e o contexto financeiro, que é da viagem.
 *
 * ⚠️ **Nenhuma porta de geometria atravessa este adaptador**, e é de propósito: a D1 diz que a
 * distância sai das paradas que o solver já escolheu. Acrescentar o roteirizador aqui é a mudança
 * que faria a tela desenhar um roteiro e cobrar outro.
 */
import {
  buildValuationFromContext,
  type TripValuationPort,
  type TripValuationPreviewPort,
} from '../../trips/application/read-trip-valuation.use-case.js'
import type { MultiVehicleSuggestionRepository } from '../application/multi-vehicle-suggestion.repository.js'
import type { SuggestionValuationPort } from '../application/suggestion-valuation.port.js'

export function createSuggestionValuationAdapter(dependencies: {
  readonly multiVehicle: MultiVehicleSuggestionRepository
  /** A mesma composição que a prévia da montagem usa — regra de frete mais contexto da viagem. */
  readonly valuation: TripValuationPort & Pick<TripValuationPreviewPort, 'readPreviewContext'>
}): SuggestionValuationPort {
  const { multiVehicle, valuation } = dependencies

  return {
    readGroups: (input) => multiVehicle.readGroups(input),
    readPreviewContext: (input) => valuation.readPreviewContext(input),
    readSuggestionStatus: (input) => multiVehicle.readSuggestionStatus(input),
    readVehicleRoads: (input) => multiVehicle.readVehicleRoads(input),
    resolveValuation: (input) => buildValuationFromContext({ ...input, repository: valuation }),
  }
}
