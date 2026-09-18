/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 096 T3: o que a montagem imprime por opção de rota. `resolveRouteOptionSummaries` é puro —
 * este é o contrato do cálculo, no molde de `test/trip/assembly-toll.contract.ts`.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveAssemblyRouteChoice,
  resolveRouteOptionSummaries,
} from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type { RouteGeometryOption } from '../../src/modules/trip/shared/routeGeometry.service'

function opcao(input: {
  readonly boothCount?: number
  readonly distanceMeters: number
  readonly durationSeconds: number
  readonly isNoToll?: boolean
  readonly signature?: string
  readonly totalCost: null | string
}): RouteGeometryOption {
  return {
    distanceMeters: input.distanceMeters,
    durationSeconds: input.durationSeconds,
    fuelTotal: null,
    isNoToll: input.isNoToll ?? false,
    legs: [],
    points: [],
    signature: input.signature ?? null,
    toll:
      input.boothCount === undefined
        ? null
        : {
            axles: { count: 2, source: 'declared' },
            catalog: { observedOn: '2026-07-01', status: 'current' },
            booths: Array.from({ length: input.boothCount }, (_unused, index) => ({
              chargeCar: null,
              chargePerAxle: null,
              latitude: '-21.9000000',
              longitude: '-47.5000000',
              name: `Praça ${index}`,
              operator: null,
              effectiveChargePerAxle: null,
              fellBackToManual: false,
              total: null,
              osmNodeId: index,
            })),
            boothsFallenBackToManual: 0,
            multiplierLabel: '2',
            boothsWithoutCharge: 0,
            chargePerAxle: '0.0000',
            paymentMode: 'manual',
            tariffObservedOn: null,
            total: '0.0000',
          },
    totalCost: input.totalCost,
  }
}

/** Ribeirão Preto → Campinas medido: a principal com cinco praças, a alternativa com quatro. */
const CAMPINAS: readonly RouteGeometryOption[] = [
  opcao({
    boothCount: 5,
    distanceMeters: 221_500,
    durationSeconds: 179 * 60,
    totalCost: '500.9713',
  }),
  opcao({
    boothCount: 4,
    distanceMeters: 239_600,
    durationSeconds: 198 * 60,
    totalCost: '517.6340',
  }),
]

describe('resumo das opções de rota (spec 096 T3)', () => {
  it('converte metro e segundo para quilômetro e minuto, na ordem que a rota chegou', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.distanceKilometres).toBeCloseTo(221.5)
    expect(resumo[0]?.minutes).toBe(179)
    expect(resumo[0]?.boothCount).toBe(5)
    expect(resumo[1]?.distanceKilometres).toBeCloseTo(239.6)
    expect(resumo[1]?.minutes).toBe(198)
    expect(resumo[1]?.boothCount).toBe(4)
  })

  /**
   * ⚠️ O caso medido de Campinas: a mesma rota é a mais rápida e a mais barata — e isso é
   * informação, não bug (spec 096). `isBestOfBoth` existe para a tela imprimir uma marca só.
   */
  it('marca a mesma rota como a melhor nas duas contas quando ela vence as duas', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.isBestOfBoth).toBe(true)
    expect(resumo[0]?.isFastest).toBe(true)
    expect(resumo[0]?.isCheapest).toBe(true)
    expect(resumo[1]?.isBestOfBoth).toBe(false)
  })

  it('separa a marca quando a mais rápida e a mais barata são rotas diferentes', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 1,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.isFastest).toBe(true)
    expect(resumo[0]?.isCheapest).toBe(false)
    expect(resumo[0]?.isBestOfBoth).toBe(false)
    expect(resumo[1]?.isCheapest).toBe(true)
    expect(resumo[1]?.isFastest).toBe(false)
  })

  /** Sem consumo/preço declarado nenhuma opção é a mais barata — nunca inventar o índice. */
  it('nenhuma opção fica marcada como mais barata quando o índice é nulo', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo.every((linha) => !linha.isCheapest)).toBe(true)
    expect(resumo.every((linha) => !linha.isBestOfBoth)).toBe(true)
  })

  it('o total é o que a política mandou, sem recalcular nada', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.totalCost).toBe('500.9713')
    expect(resumo[1]?.totalCost).toBe('517.6340')
  })
})

describe('opção sem pedágio calculado (revisão de 2026-09-07)', () => {
  /**
   * ⚠️ `toll` nulo é **desconhecido**, e colapsá-lo em `0` faz a linha do seletor afirmar que a
   * alternativa não passa por praça nenhuma — na única superfície que o operador lê para escolher.
   * O `totalCost` já se escondia quando nulo; a contagem de praças não.
   */
  it('não conta zero praça quando o pedágio da opção não pôde ser calculado', () => {
    const [resumo] = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: 0,
      options: [
        {
          distanceMeters: 239_600,
          durationSeconds: 11_880,
          fuelTotal: null,
          isNoToll: false,
          legs: [],
          points: [],
          signature: null,
          toll: null,
          totalCost: null,
        },
      ],
    })

    expect(resumo?.boothCount).toBeNull()
  })

  it('conta as praças quando o pedágio foi calculado, inclusive zero medido', () => {
    const [semPraca] = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: [
        {
          distanceMeters: 100_000,
          durationSeconds: 3_600,
          fuelTotal: '100.0000',
          isNoToll: false,
          legs: [],
          points: [],
          signature: null,
          toll: {
            axles: { count: 2, source: 'declared' },
            catalog: { observedOn: '2026-07-01', status: 'current' },
            booths: [],
            boothsFallenBackToManual: 0,
            multiplierLabel: '2',
            boothsWithoutCharge: 0,
            chargePerAxle: '0.0000',
            paymentMode: 'manual',
            tariffObservedOn: null,
            total: '0.0000',
          },
          totalCost: '100.0000',
        },
      ],
    })

    expect(semPraca?.boothCount).toBe(0)
  })
})

/**
 * Spec 153 D2/D3: a rota que o operador viu na montagem vai junto ao planejar, pela **assinatura** —
 * o índice de agora é outra estrada quando a API pede as rotas de novo. O critério só vale quando a
 * assinatura não é reencontrada.
 */
describe('escolha de rota enviada ao planejar (spec 153)', () => {
  const OPCOES: readonly RouteGeometryOption[] = [
    opcao({
      distanceMeters: 213_500,
      durationSeconds: 170 * 60,
      signature: 'principal',
      totalCost: '517.6340',
    }),
    opcao({
      distanceMeters: 224_900,
      durationSeconds: 185 * 60,
      signature: 'barata',
      totalCost: '500.9713',
    }),
    opcao({
      distanceMeters: 230_000,
      durationSeconds: 190 * 60,
      signature: 'outra',
      totalCost: '530.0000',
    }),
  ]

  it('rota única não é escolha: nada vai ao servidor', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 0,
        fastestIndex: 0,
        hasChoice: false,
        options: OPCOES.slice(0, 1),
        selectedIndex: 0,
      }),
    ).toBeUndefined()
  })

  it('a mais barata escolhida vai como cheapest, com a assinatura dela', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 1,
      }),
    ).toEqual({ criterion: 'cheapest', signature: 'barata' })
  })

  it('a mais rápida escolhida vai como fastest', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 0,
      }),
    ).toEqual({ criterion: 'fastest', signature: 'principal' })
  })

  /** A rota da chamada `exclude=toll` tem regra própria no servidor: sem assinatura, ela ainda casa. */
  it('a rota sem pedágio escolhida vai como no_toll', () => {
    const opcoes = [
      ...OPCOES.slice(0, 2),
      opcao({
        distanceMeters: 240_000,
        durationSeconds: 200 * 60,
        isNoToll: true,
        signature: 'sem-pedagio',
        totalCost: '540.0000',
      }),
    ]

    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: opcoes,
        selectedIndex: 2,
      }),
    ).toEqual({ criterion: 'no_toll', signature: 'sem-pedagio' })
  })

  it('a que não é nem a mais barata nem a mais rápida vai como alternative', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 2,
      }),
    ).toEqual({ criterion: 'alternative', signature: 'outra' })
  })

  /** Sem custo comparável a mais barata não existe — a rota vista vai pela assinatura, sem rótulo. */
  it('sem mais barata conhecida a principal vista vai como alternative, pela assinatura', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: null,
        fastestIndex: 1,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 0,
      }),
    ).toEqual({ criterion: 'alternative', signature: 'principal' })
  })
})
