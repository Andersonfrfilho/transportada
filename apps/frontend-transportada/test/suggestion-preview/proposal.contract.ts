/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveProposalVehicles } from '@/modules/routing/shared/suggestionProposal.service'

const PLATES = new Map([['vehicle-1', 'RTD5J78']])

function stop(
  overrides: Partial<{
    excludedFromOptimization: boolean
    label: string
    nfeDocumentIds: readonly string[]
    vehicleId: null | string
  }> = {},
) {
  return {
    excludedFromOptimization: false,
    label: 'TAQUARITINGA',
    nfeDocumentIds: ['doc-1'],
    vehicleId: 'vehicle-1' as null | string,
    ...overrides,
  }
}

describe('a proposta antes do rascunho (spec 108)', () => {
  test('agrupa paradas e notas por veículo', () => {
    const vehicles = resolveProposalVehicles({
      plateByVehicleId: PLATES,
      stops: [
        stop({ nfeDocumentIds: ['doc-1'] }),
        stop({ nfeDocumentIds: ['doc-2', 'doc-3'] }),
        stop({ nfeDocumentIds: ['doc-9'], vehicleId: 'vehicle-2' }),
      ],
    })

    expect(vehicles).toHaveLength(2)
    expect(vehicles[0]).toEqual({
      documentCount: 3,
      plate: 'RTD5J78',
      stopCount: 2,
      stopLabels: ['TAQUARITINGA', 'TAQUARITINGA'],
      vehicleId: 'vehicle-1',
    })
    /** Placa desconhecida não some: a proposta é a informação, o nome do caminhão é acessório. */
    expect(vehicles[1]?.plate).toBe(null)
  })

  /**
   * ⚠️ A mesma nota em duas paradas do mesmo caminhão é **uma** entrega. Somar as listas cruas
   * inflaria justamente o número que o operador usa para decidir se aceita.
   */
  test('conta a nota repetida uma vez por veículo', () => {
    const vehicles = resolveProposalVehicles({
      plateByVehicleId: PLATES,
      stops: [stop({ nfeDocumentIds: ['doc-1'] }), stop({ nfeDocumentIds: ['doc-1'] })],
    })

    expect(vehicles[0]?.documentCount).toBe(1)
    expect(vehicles[0]?.stopCount).toBe(2)
  })

  /**
   * ⚠️ Parada sem veículo é **sobra**, e ela tem painel próprio com a causa. Contá-la aqui a faria
   * parecer distribuída — que é o defeito que a spec 107 veio consertar.
   */
  /**
   * ⚠️ A ordem das paradas é a **do roteiro proposto**, e é ela que o operador lê para decidir. A
   * consulta já devolve por `sequence`; reordenar aqui por nome mostraria um roteiro que o caminhão
   * não vai fazer.
   */
  test('preserva a ordem das paradas do roteiro', () => {
    const vehicles = resolveProposalVehicles({
      plateByVehicleId: PLATES,
      stops: [stop({ label: 'IPUA' }), stop({ label: 'AGUAI' }), stop({ label: 'ORLANDIA' })],
    })

    expect(vehicles[0]?.stopLabels).toEqual(['IPUA', 'AGUAI', 'ORLANDIA'])
  })

  test('a parada sem veículo não entra na distribuição', () => {
    const vehicles = resolveProposalVehicles({
      plateByVehicleId: PLATES,
      stops: [stop({ vehicleId: null }), stop({ excludedFromOptimization: true, vehicleId: null })],
    })

    expect(vehicles).toEqual([])
  })
})
