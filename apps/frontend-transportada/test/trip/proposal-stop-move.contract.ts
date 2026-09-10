/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  applyStopMoves,
  resolveAcceptedStopOrders,
  resolveMovedVehicleIds,
  resolveMoveTargets,
  sumStopWeight,
} from '@/modules/trip/shared/proposalStopMove.service'
import type { ProposalVehicleView } from '@/modules/trip/shared/proposalView.service'
import type { ProposalStop } from '@/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(path: string): string {
  return readFileSync(new URL(path, APPLICATION_ROOT), 'utf8')
}

function stop(overrides: Partial<ProposalStop>): ProposalStop {
  return {
    distanceFromPreviousMeters: null,
    durationFromPreviousSeconds: null,
    estimatedArrivalAt: null,
    excludedFromOptimization: false,
    geocodingPrecision: null,
    label: 'FRANCA',
    nfeDocumentIds: [],
    sequence: 1,
    vehicleId: 'truck-a',
    ...overrides,
  }
}

function view(overrides: Partial<ProposalVehicleView>): ProposalVehicleView {
  return {
    maxPayloadKilograms: '8000.000',
    plate: 'RTA2F45',
    vehicleId: 'truck-b',
    vehicleLabel: 'ATEGO',
    weightKilograms: '7000.000',
    ...overrides,
  } as ProposalVehicleView
}

/** Spec 112: jogar a parada da proposta em outro caminhão com espaço. */
describe('mover parada entre caminhões da proposta', () => {
  const stops = [
    stop({ nfeDocumentIds: ['nota-1'], sequence: 1, vehicleId: 'truck-a' }),
    stop({ nfeDocumentIds: ['nota-2', 'nota-3'], sequence: 2, vehicleId: 'truck-a' }),
    stop({ nfeDocumentIds: ['nota-4'], sequence: 3, vehicleId: 'truck-b' }),
  ]

  /** A parada é identificada pela nota: qualquer nota dela carrega a parada inteira. */
  it('aplica o movimento à parada inteira', () => {
    const moved = applyStopMoves(stops, new Map([['nota-3', 'truck-b']]))
    expect(moved.map((entry) => entry.vehicleId)).toEqual(['truck-a', 'truck-b', 'truck-b'])
  })

  it('diz quais caminhões o movimento toca, os dois lados', () => {
    expect([...resolveMovedVehicleIds(stops, new Map([['nota-1', 'truck-b']]))].sort()).toEqual([
      'truck-a',
      'truck-b',
    ])
    /** Mover para o próprio caminhão não é movimento. */
    expect(resolveMovedVehicleIds(stops, new Map([['nota-1', 'truck-a']])).size).toBe(0)
  })

  /**
   * ⚠️ **"Espaço" é peso**, e desconhecido não cabe em lugar nenhum: sem teto na ficha, sem peso
   * atual, ou sem o peso da parada, o caminhão não é oferecido.
   */
  it('só oferece caminhão com sobra de peso para a parada', () => {
    const views = [
      view({ vehicleId: 'truck-a' }),
      view({ vehicleId: 'truck-b', weightKilograms: '7000.000' }),
      view({ vehicleId: 'truck-c', weightKilograms: '7950.000' }),
      view({ maxPayloadKilograms: null, vehicleId: 'truck-d' }),
      view({ vehicleId: 'truck-e', weightKilograms: null }),
    ]

    const targets = resolveMoveTargets({
      fromVehicleId: 'truck-a',
      stopWeightKilograms: '100.5',
      views,
    })

    expect(targets.map((target) => target.vehicleId)).toEqual(['truck-b'])
    expect(targets[0]?.loadKilograms).toBe(targets[0]?.loadKilograms)
    expect(
      resolveMoveTargets({ fromVehicleId: 'truck-a', stopWeightKilograms: null, views }),
    ).toEqual([])
  })

  it('cabe exatamente no teto, e não cabe um grama acima', () => {
    const views = [view({ vehicleId: 'truck-b', weightKilograms: '7900.000' })]
    expect(
      resolveMoveTargets({ fromVehicleId: 'truck-a', stopWeightKilograms: '100.000', views }),
    ).toHaveLength(1)
    expect(
      resolveMoveTargets({ fromVehicleId: 'truck-a', stopWeightKilograms: '100.001', views }),
    ).toHaveLength(0)
  })

  /** Uma nota sem peso torna o total desconhecido — nunca "o que deu para somar". */
  it('soma o peso da parada só quando toda nota tem peso', () => {
    expect(sumStopWeight(['10.5', '2.25'])).not.toBeNull()
    expect(sumStopWeight(['10.5', null])).toBeNull()
    expect(sumStopWeight([])).toBeNull()
  })

  /**
   * ⚠️ O caminhão que **só ganhou** parada não tinha ordem salva, e sem ele no corpo o movimento se
   * perdia calado no aceite.
   */
  it('o aceite leva a ordem de quem ganhou parada, com a parada nova no fim', () => {
    const addressById = new Map([
      ['nota-1', { cityCode: '3516200', number: '1', postalCode: '14400000' }],
      ['nota-2', { cityCode: '3516200', number: '2', postalCode: '14400000' }],
      ['nota-3', { cityCode: '3516200', number: '2', postalCode: '14400000' }],
      ['nota-4', { cityCode: '3516200', number: '4', postalCode: '14400000' }],
    ])

    const orders = resolveAcceptedStopOrders({
      addressById,
      manualOrderByVehicle: new Map(),
      moves: new Map([['nota-1', 'truck-b']]),
      stops,
    })

    expect(orders).toEqual([
      { orderedAddressKeys: ['3516200|14400000|1', '3516200|14400000|4'], vehicleId: 'truck-b' },
    ])
  })

  it('reconcilia a ordem salva com a parada que chegou depois', () => {
    const addressById = new Map([
      ['nota-1', { cityCode: '3516200', number: '1', postalCode: '14400000' }],
      ['nota-4', { cityCode: '3516200', number: '4', postalCode: '14400000' }],
    ])

    const orders = resolveAcceptedStopOrders({
      addressById,
      manualOrderByVehicle: new Map([['truck-b', ['3516200|14400000|4']]]),
      moves: new Map([['nota-1', 'truck-b']]),
      stops,
    })

    expect(orders.find((entry) => entry.vehicleId === 'truck-b')?.orderedAddressKeys).toEqual([
      '3516200|14400000|4',
      '3516200|14400000|1',
    ])
  })

  it('o mapa só desenha o select com opção, e nunca na parada marcada para sair', () => {
    const map = readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')
    expect(map).toContain('resolveMoveTargets(point).length === 0 ? null : (')
    expect(map).toContain('isRemoved(point) ||')
    expect(map).toContain('enabled: measuredPoints.length >= 2 && !isDraft')
  })

  /**
   * ⚠️ Parada sem CEP utilizável não se move: a chave dela é o degrau `cidade:` da tela, que a API
   * ignora — o movimento sumiria no aceite sem aviso.
   */
  it('parada de endereço sem CEP utilizável não ganha select', () => {
    const detail = readSource('src/modules/trip/components/TripProposalDetail.component.tsx')
    expect(detail).toContain("if (point.stopKey.startsWith('cidade:')) return []")
  })

  /** Movimento pausa as medições dos dois caminhões, e segura o último número medido. */
  it('movimento em rascunho pausa carga, conta e rota', () => {
    const detail = readSource('src/modules/trip/components/TripProposalDetail.component.tsx')
    const cargo = readSource('src/modules/trip/hooks/useTripCargoPreview.hook.ts')
    const valuation = readSource(
      'src/modules/trip-financials/hooks/useTripValuationPreview.hook.ts',
    )
    expect(detail).toContain('const isMeasurementPaused = draftOrder !== null || hasDraftMove')
    expect(detail.match(/isPaused: isMeasurementPaused,/gu)?.length).toBe(2)
    for (const source of [cargo, valuation]) {
      expect(source).toContain('input.isPaused !== true &&')
      expect(source).toContain('placeholderData: (previous) => (input.isPaused === true ? previous')
    }
  })

  /** A linha recolhida do caminhão alterado não mostra a conta do roteirizador como atual. */
  it('a conta do roteirizador vira ausência no caminhão alterado', () => {
    const service = readSource('src/modules/trip/shared/proposalView.service.ts')
    expect(service).toContain('input.staleValuationVehicleIds?.has(vehicleId) === true')
  })
})
