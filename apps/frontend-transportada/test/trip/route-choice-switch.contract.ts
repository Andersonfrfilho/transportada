/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T402: o switch explícito entre a rota mais rápida e a mais barata (RF13), sobre as
 * opções que a montagem já tem em mãos — sem ida nova ao OSRM. No molde de
 * `test/trip/assembly-route-options.contract.ts`: contrato do cálculo puro primeiro, depois o
 * contrato de tela por texto de fonte (mesmo molde de `assembly-route-selector.contract.ts`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveRouteChoiceFromIndex } from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type { RouteGeometryOption } from '../../src/modules/trip/shared/routeGeometry.service'

const ASSEMBLY_MAP = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)
const ROUTE_CHOICE_OPTIONS = new URL(
  '../../src/modules/trip/components/RouteChoiceOptions.component.tsx',
  import.meta.url,
)
const ROUTE_TOLL_SUMMARY = new URL(
  '../../src/modules/trip/components/RouteTollSummary.component.tsx',
  import.meta.url,
)

function opcao(input: {
  readonly isNoToll?: boolean
  readonly signature?: null | string
}): RouteGeometryOption {
  return {
    distanceMeters: 100_000,
    durationSeconds: 3_600,
    fuelTotal: null,
    isNoToll: input.isNoToll ?? false,
    legs: [],
    points: [],
    signature: input.signature ?? null,
    toll: null,
    totalCost: null,
  }
}

describe('resolveRouteChoiceFromIndex (spec 153 T402 / D2)', () => {
  const OPTIONS: readonly RouteGeometryOption[] = [
    opcao({ signature: 'aaaa' }),
    opcao({ isNoToll: true, signature: 'bbbb' }),
    opcao({ signature: 'cccc' }),
  ]

  it('identifica a rota mais barata pelo índice, nunca por posição arbitrária', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 0,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'cheapest', signature: 'aaaa' })
  })

  it('identifica a rota mais rápida pelo índice', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 2,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'fastest', signature: 'cccc' })
  })

  it('identifica a opção sem pedágio quando ela não é a mais rápida nem a mais barata', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 1,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'no_toll', signature: 'bbbb' })
  })

  /** Sem pedágio e mais barata ao mesmo tempo: a razão da escolha é o custo, não a ausência de praça. */
  it('prioriza mais barata/mais rápida sobre sem pedágio quando as duas coincidem', () => {
    const comSemPedagioBarata: readonly RouteGeometryOption[] = [
      opcao({ isNoToll: true, signature: 'zzzz' }),
    ]

    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: null,
      index: 0,
      options: comSemPedagioBarata,
    })

    expect(escolha.criterion).toBe('cheapest')
  })

  it('cai em alternative quando a opção não é a mais rápida, a mais barata, nem sem pedágio', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 1,
      options: [opcao({ signature: 'a' }), opcao({ signature: 'b' }), opcao({ signature: 'c' })],
    })

    expect(escolha).toEqual({ criterion: 'alternative', signature: 'b' })
  })

  it('a assinatura é null quando a opção não a trouxe, nunca inventada', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: null,
      index: 0,
      options: [opcao({ signature: null })],
    })

    expect(escolha.signature).toBeNull()
  })
})

describe('TripAssemblyMap: switch mais rápida ↔ mais barata sem novo OSRM (spec 153 T402/RF13)', () => {
  const source = readFileSync(ASSEMBLY_MAP, 'utf8')

  /**
   * ⚠️ Só pode existir **uma** chamada ao roteirizador nesta tela — trocar de critério não é
   * motivo para ida nova ao OSRM (RF13). Duas ocorrências da chamada provariam um segundo fetch.
   */
  it('chama a geometria uma única vez — trocar de critério não refaz a chamada', () => {
    const chamadas = source.split('readPointsRouteGeometry').length - 1
    expect(chamadas).toBe(1)
  })

  /**
   * A chave da consulta não pode depender do índice/critério escolhido — senão trocar mudaria a
   * `queryKey` e o TanStack Query disparia a busca de novo.
   */
  it('a chave da consulta de geometria não inclui o índice/critério escolhido', () => {
    const queryKeyBlock = source.slice(
      source.indexOf('queryKey: '),
      source.indexOf('queryKey: ') + 200,
    )
    expect(queryKeyBlock).not.toInclude('selectedOptionIndex')
    expect(queryKeyBlock).not.toInclude('routeChoiceCriterion')
  })

  /** D1: a tela abre na mais barata — o `selectedIndex` que a API já resolveu, nunca `0` fixo. */
  it('abre a escolha na rota que a API já resolveu como mais barata', () => {
    expect(source).toInclude('selectedIndex')
    expect(source).not.toInclude('setSelectedOptionIndex(0)')
  })

  it('monta o switch abaixo do bloco de pedágio, e propaga canReadFinancials', () => {
    const tollIndex = source.indexOf('<RouteTollSummary')
    const switchIndex = source.indexOf('<RouteChoiceOptions')

    expect(tollIndex).toBeGreaterThan(-1)
    expect(switchIndex).toBeGreaterThan(tollIndex)
    expect(source).toInclude('canReadFinancials={canReadFinancials}')
  })

  /** Trocar regrava a escolha (RF13): o callback de saída dispara a cada troca. */
  it('a troca de opção sai do componente por onRouteChoiceChange, nunca por índice cru', () => {
    expect(source).toInclude('onRouteChoiceChange?.(')
    expect(source).toInclude('resolveRouteChoiceFromIndex')
  })
})

describe('RouteChoiceOptions: seletor com "Sem pedágio" e switch (spec 153 T402)', () => {
  const source = readFileSync(ROUTE_CHOICE_OPTIONS, 'utf8')

  it('rotula a opção sem pedágio calculado', () => {
    expect(source).toInclude('isNoToll')
    expect(source).toInclude('routeOptions.noToll')
  })

  it('o switch usa o primitivo de abas do design system, não um controle cru', () => {
    expect(source).toInclude("from '@/components/ui/tabs'")
  })

  /** RF13: opção única (ou empate mais rápida/mais barata) avisa em tela — nunca switch inerte. */
  it('sem alternativa real entre mais rápida e mais barata, avisa em vez de montar o switch', () => {
    expect(source).toInclude('routeOptions.singleOption')
    const semAlternativaIndex = source.indexOf('routeOptions.singleOption')
    const tabsIndex = source.indexOf('<Tabs')
    expect(semAlternativaIndex).toBeGreaterThan(-1)
    expect(tabsIndex).toBeGreaterThan(-1)
  })

  /** D10: sem `trip.financials` o total some da tela, nunca vira zero. */
  it('o total só imprime com canReadFinancials — nunca condicionado só ao dado', () => {
    const totalBlock = source.slice(
      source.indexOf("t('assemblyMap.routeOptions.total'"),
      source.indexOf("t('assemblyMap.routeOptions.total'") + 1,
    )
    expect(totalBlock).not.toBe('')
    expect(source).toInclude('canReadFinancials &&')
  })
})

describe('RouteTollSummary: canReadFinancials some com o dinheiro, nunca com o resto (spec 153 D10)', () => {
  const source = readFileSync(ROUTE_TOLL_SUMMARY, 'utf8')

  it('recebe canReadFinancials como prop', () => {
    expect(source).toInclude('canReadFinancials: boolean')
  })

  it('o resumo com valor e o extrato por praça são guardados por canReadFinancials', () => {
    const summaryGuardIndex = source.indexOf('!canReadFinancials')
    expect(summaryGuardIndex).toBeGreaterThan(-1)
  })

  /** Praças, forma de pagamento e catálogo não são dinheiro — continuam fora da trava. */
  it('a lista de praças e a forma de pagamento continuam fora da trava de canReadFinancials', () => {
    const paymentModeIndex = source.indexOf('toll.paymentMode}`')
    const boothListIndex = source.indexOf('toll.booths.map')
    expect(paymentModeIndex).toBeGreaterThan(-1)
    expect(boothListIndex).toBeGreaterThan(-1)
  })
})
