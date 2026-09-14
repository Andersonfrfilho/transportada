import { describe, expect, test } from 'bun:test'

import { multiVehicleProposalFromApi } from '@/modules/trip/shared/multiVehicleSuggestion.validation'

/**
 * Spec 110 RF10: **a parada chega inteira, e o adaptador lia quatro campos de doze.**
 *
 * ⚠️ Medido em 2026-09-09: `serializeSuggestion` na API devolve `suggestion.stops` sem recorte, e
 * `RouteSuggestionStop` já tem `estimatedArrivalAt`, `distanceFromPreviousMeters`,
 * `durationFromPreviousSeconds`, `sequence` e `geocodingPrecision`. Quem descartava era
 * `coverableStopsFromApi`, uma linha antes de eles virarem tela — e é por isso que a proposta não
 * tinha como desenhar ETA nem quilometragem de perna.
 *
 * Consequência boa: esta RF **não tem janela de deploy**. O bundle novo lê um corpo que a API já
 * serve hoje.
 */
const API_PAYLOAD = {
  id: '2f3d0a7e-1111-4444-8888-000000000001',
  status: 'ready',
  stops: [
    {
      addressKey: 'ribeirao',
      distanceFromPreviousMeters: 18_400,
      durationFromPreviousSeconds: 1_920,
      estimatedArrivalAt: '2026-09-10T11:40:00.000Z',
      excludedFromOptimization: false,
      geocodingPrecision: 'rooftop',
      leftoverReason: null,
      label: 'Ribeirão Preto',
      nfeDocumentIds: ['doc-1', 'doc-2'],
      sequence: 1,
      vehicleId: 'vehicle-1',
    },
    {
      addressKey: 'itobi',
      distanceFromPreviousMeters: null,
      durationFromPreviousSeconds: null,
      estimatedArrivalAt: null,
      excludedFromOptimization: true,
      geocodingPrecision: 'city',
      leftoverReason: null,
      label: 'Itobi',
      nfeDocumentIds: ['doc-3'],
      sequence: 2,
      vehicleId: null,
    },
  ],
  truncated: false,
} as const

describe('proposal stop fields contract', () => {
  test('a parada proposta carrega ETA, perna e precisão — não só rótulo e veículo', () => {
    const [first] = multiVehicleProposalFromApi(API_PAYLOAD).stops

    expect(first).toEqual({
      distanceFromPreviousMeters: 18_400,
      durationFromPreviousSeconds: 1_920,
      estimatedArrivalAt: '2026-09-10T11:40:00.000Z',
      excludedFromOptimization: false,
      geocodingPrecision: 'rooftop',
      leftoverReason: null,
      label: 'Ribeirão Preto',
      nfeDocumentIds: ['doc-1', 'doc-2'],
      sequence: 1,
      vehicleId: 'vehicle-1',
    })
  })

  /**
   * ⚠️ Ausência é `null`, **nunca zero**: perna sem distância conhecida desenhada como `0 km` diria
   * que a parada é na porta da anterior — e é a primeira parada do dia que não tem perna anterior.
   */
  test('perna desconhecida é nula, e a precisão de município sobrevive à leitura', () => {
    const [, second] = multiVehicleProposalFromApi(API_PAYLOAD).stops

    expect(second?.distanceFromPreviousMeters).toBeNull()
    expect(second?.durationFromPreviousSeconds).toBeNull()
    expect(second?.estimatedArrivalAt).toBeNull()
    expect(second?.geocodingPrecision).toBe('city')
    expect(second?.excludedFromOptimization).toBe(true)
  })

  /**
   * Corpo anterior à spec 110 (ou parada que a API não preencheu) **não derruba a proposta**: ela
   * degrada para ausência, que é o que a tela já sabe desenhar.
   */
  test('campo ausente vira ausência, nunca exceção', () => {
    const proposal = multiVehicleProposalFromApi({
      id: '2f3d0a7e-1111-4444-8888-000000000002',
      status: 'ready',
      stops: [{ label: 'Barrinha', nfeDocumentIds: [], vehicleId: 'vehicle-9' }],
      truncated: false,
    })

    expect(proposal.stops[0]).toEqual({
      distanceFromPreviousMeters: null,
      durationFromPreviousSeconds: null,
      estimatedArrivalAt: null,
      excludedFromOptimization: false,
      geocodingPrecision: null,
      leftoverReason: null,
      label: 'Barrinha',
      nfeDocumentIds: [],
      sequence: 0,
      vehicleId: 'vehicle-9',
    })
  })
})
