/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 096 T1: a resposta de `/route-geometry` passa a trazer as alternativas e o ranking — este
 * contrato guarda que `routeGeometryFromApi` os lê, e que uma opção malformada zera só as opções,
 * nunca a linha ou o pedágio da principal.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()
const routeGeometryFromApi = (input: unknown) => adapters.routeGeometryFromApi(input)

const PONTO = { latitude: '-21.17670', longitude: '-47.81030' }

function opcaoBruta(input: { readonly distanceMeters: number; readonly totalCost: null | string }) {
  return {
    distanceMeters: input.distanceMeters,
    durationSeconds: 3_600,
    fuelTotal: null,
    legs: [{ distanceMetres: input.distanceMeters, durationSeconds: 3_600 }],
    points: [PONTO, PONTO],
    toll: null,
    totalCost: input.totalCost,
  }
}

describe('leitura das opções de rota (spec 096 T1)', () => {
  it('lê as opções e o ranking quando a resposta os traz', () => {
    const view = routeGeometryFromApi({
      cheapestIndex: 0,
      costGap: null,
      fastestIndex: 0,
      hasChoice: true,
      legs: [{ distanceMetres: 221_500, durationSeconds: 10_740 }],
      options: [
        opcaoBruta({ distanceMeters: 221_500, totalCost: '500.9713' }),
        opcaoBruta({ distanceMeters: 239_600, totalCost: '517.6340' }),
      ],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.hasChoice).toBe(true)
    expect(view.options).toHaveLength(2)
    expect(view.cheapestIndex).toBe(0)
    expect(view.fastestIndex).toBe(0)
    expect(view.costGap).toBeNull()
  })

  /** Sem consumo/preço declarado a razão chega intacta — nunca virando `null` por descuido. */
  it('lê o motivo da ausência de rota mais barata', () => {
    const view = routeGeometryFromApi({
      cheapestIndex: null,
      costGap: 'NO_FUEL_BASELINE',
      fastestIndex: 0,
      hasChoice: true,
      legs: [],
      options: [opcaoBruta({ distanceMeters: 100_000, totalCost: null })],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.costGap).toBe('NO_FUEL_BASELINE')
    expect(view.cheapestIndex).toBeNull()
  })

  /** Rota única — a maioria medida — não traz `hasChoice: true`, e a lista tem uma opção só. */
  it('rota única publica uma opção só, e hasChoice falso', () => {
    const view = routeGeometryFromApi({
      cheapestIndex: null,
      costGap: null,
      fastestIndex: 0,
      hasChoice: false,
      legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
      options: [opcaoBruta({ distanceMeters: 106_600, totalCost: null })],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.hasChoice).toBe(false)
    expect(view.options).toHaveLength(1)
  })

  /**
   * ⚠️ Opção estranha zera **só as opções** — a linha e o pedágio da principal continuam válidos,
   * porque zerar tudo por causa de uma alternativa malformada apagaria um desenho bom.
   */
  it('opção malformada não derruba a linha nem o pedágio da rota principal', () => {
    const view = routeGeometryFromApi({
      cheapestIndex: 0,
      costGap: null,
      fastestIndex: 0,
      hasChoice: true,
      legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
      options: [{ distanceMeters: 'não é número' }],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.options).toEqual([])
    expect(view.legs).toEqual([{ distanceMetres: 106_600, durationSeconds: 5_160 }])
    expect(view.source).toBe('road')
  })

  /** Resposta sem os campos novos (contrato antigo) continua sendo lida como "sem escolha". */
  it('resposta sem os campos da 096 vira ausência de escolha, não erro', () => {
    const view = routeGeometryFromApi({
      legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.hasChoice).toBe(false)
    expect(view.options).toEqual([])
    expect(view.cheapestIndex).toBeNull()
    expect(view.costGap).toBeNull()
  })

  /**
   * Spec 153: a rota que a viagem usa é `options[selectedIndex]`, não sempre a principal. O parser
   * descartava o índice e a assinatura, e o detalhe mostrava a principal (213,5 km) no lugar da
   * mais barata escolhida na montagem (224,9 km).
   */
  it('lê a rota escolhida, a assinatura por opção e o congelamento (spec 153)', () => {
    const view = routeGeometryFromApi({
      cheapestIndex: 1,
      choiceReproduced: true,
      costGap: null,
      criterion: 'cheapest',
      fastestIndex: 0,
      frozen: true,
      hasChoice: true,
      legs: [{ distanceMetres: 224_900, durationSeconds: 10_740 }],
      options: [
        { ...opcaoBruta({ distanceMeters: 213_500, totalCost: '517.6340' }), signature: 'sig-a' },
        {
          ...opcaoBruta({ distanceMeters: 224_900, totalCost: '500.9713' }),
          signature: 'sig-b',
          isNoToll: true,
        },
      ],
      points: [PONTO, PONTO],
      selectedIndex: 1,
      source: 'road',
      toll: null,
    })

    expect(view.selectedIndex).toBe(1)
    expect(view.options?.[1]?.signature).toBe('sig-b')
    expect(view.options?.[1]?.isNoToll).toBe(true)
    expect(view.options?.[0]?.isNoToll).toBe(false)
    expect(view.choiceReproduced).toBe(true)
    expect(view.frozen).toBe(true)
    expect(view.criterion).toBe('cheapest')
  })

  /** Índice que não aponta para opção nenhuma é ausência — nunca um `undefined` vazando para a tela. */
  it('selectedIndex fora da lista de opções vira null', () => {
    const view = routeGeometryFromApi({
      hasChoice: false,
      legs: [],
      options: [opcaoBruta({ distanceMeters: 100_000, totalCost: null })],
      points: [PONTO, PONTO],
      selectedIndex: 3,
      source: 'road',
      toll: null,
    })

    expect(view.selectedIndex).toBeNull()
  })

  /** Resposta anterior à 153 continua lida: sem índice, sem assinatura, sem congelamento. */
  it('resposta sem os campos da 153 vira principal, assinatura nula e rota não congelada', () => {
    const view = routeGeometryFromApi({
      hasChoice: false,
      legs: [],
      options: [opcaoBruta({ distanceMeters: 100_000, totalCost: null })],
      points: [PONTO, PONTO],
      source: 'road',
      toll: null,
    })

    expect(view.selectedIndex).toBeNull()
    expect(view.options?.[0]?.signature).toBeNull()
    expect(view.frozen).toBe(false)
    expect(view.criterion).toBeNull()
  })
})
