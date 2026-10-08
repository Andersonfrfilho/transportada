/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 T3.3: opções dos filtros de cidade, UF e emitente do relatório de viagens.
 */
import type {
  ListTripReportFacetsParams,
  ListTripReportFacetsResult,
} from '../domain/trip-report.types.js'
import type { TripReportPort } from './trip-report.port.js'

export function createListTripReportFacetsUseCase(dependencies: {
  readonly repository: TripReportPort
}): (params: ListTripReportFacetsParams) => Promise<ListTripReportFacetsResult> {
  const { repository } = dependencies

  return async (params) => {
    // Todas as listas são obrigatórias: faceta faltando deixaria o filtro mentir, então uma falha derruba a resposta.
    const [emitterCities, recipientCities, emitterStates, recipientStates, emitters] =
      await Promise.all([
        repository.listFacetPlaces({ ...params, kind: 'city', side: 'emitter' }),
        repository.listFacetPlaces({ ...params, kind: 'city', side: 'recipient' }),
        repository.listFacetPlaces({ ...params, kind: 'state', side: 'emitter' }),
        repository.listFacetPlaces({ ...params, kind: 'state', side: 'recipient' }),
        repository.listFacetEmitters(params),
      ])
    return {
      data: {
        cities: { emitter: emitterCities, recipient: recipientCities },
        emitters,
        states: { emitter: emitterStates, recipient: recipientStates },
      },
    }
  }
}
