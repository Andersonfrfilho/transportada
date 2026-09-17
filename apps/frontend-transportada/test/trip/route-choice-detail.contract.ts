/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T405: o detalhe da viagem é a última tela onde o operador troca a rota de uma viagem
 * já congelada. Cobre (a) a regravação via `plan-route`, reaproveitando as opções que uma única
 * leitura viva já trouxe — nunca uma ida nova ao roteirizador (RF13, mesmo molde de T402/T403) —
 * e (b) o detalhe mostrando km/volta/tempo (D9), critério, os dois avisos (escolha não
 * reproduzida — D3 — e rota não calculada — D5) e dinheiro só com `trip.financials` (D10).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, test } from 'bun:test'

import { resolveRouteChoiceFromIndex } from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type { RouteGeometryOption } from '../../src/modules/trip/shared/routeGeometry.service'
import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN, TRIP_ID } from './trip.fixture'

const TRIP_ROUTE_CHOICE_SWITCH = new URL(
  '../../src/modules/trip/components/TripRouteChoiceSwitch.component.tsx',
  import.meta.url,
)
const TRIP_ROUTE_MAP = new URL(
  '../../src/modules/trip/components/TripRouteMap.component.tsx',
  import.meta.url,
)
const TRIP_ROUTE_COST_SUMMARY = new URL(
  '../../src/modules/trip/components/TripRouteCostSummary.component.tsx',
  import.meta.url,
)
const TRIP_DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

const API_URL = 'https://api.example.test'

type RouteChoice = Readonly<{
  criterion: 'alternative' | 'cheapest' | 'fastest' | 'no_toll'
  signature: null | string
}>

type PlanTripRouteInput = Readonly<{ routeChoice?: RouteChoice; tripId: string }>

type TripClientModule = Readonly<{
  createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => Readonly<{ planTripRoute: (input: PlanTripRouteInput) => Promise<unknown> }>
}>

async function createPlanRouteRecordingClient(
  requests: Request[],
): Promise<Readonly<{ planTripRoute: (input: PlanTripRouteInput) => Promise<unknown> }>> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({ data: { tripStatus: 'route_planned' } }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
}

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

describe('regravação no detalhe: plan-route com a escolha nova, sem ida nova ao route-geometry (spec 153 T405/RF13)', () => {
  /**
   * ⚠️ Prova as duas metades JUNTAS, na mesma asserção: (1) o corpo do POST carrega a escolha nova
   * — a regravação de fato aconteceu — e (2) a única requisição feita foi essa, nunca uma segunda
   * ao `/route-geometry` — a troca reaproveitou as opções que a leitura viva já tinha em mãos.
   * Provar só uma das duas deixaria passar o defeito que o pedido veio evitar.
   */
  test('trocar mais rápida ↔ mais barata regrava via plan-route usando as opções já buscadas — nenhuma chamada nova ao roteirizador', async () => {
    const requests: Request[] = []
    const client = await createPlanRouteRecordingClient(requests)

    const options: readonly RouteGeometryOption[] = [
      opcao({ signature: 'rota-mais-rapida' }),
      opcao({ signature: 'rota-mais-barata' }),
    ]
    /** As opções já vieram de uma leitura viva anterior — nenhum fetch acontece aqui. */
    const routeChoice = resolveRouteChoiceFromIndex({
      cheapestIndex: 1,
      fastestIndex: 0,
      index: 1,
      options,
    })

    await client.planTripRoute({ routeChoice, tripId: TRIP_ID })

    expect(requests).toHaveLength(1)
    const [request] = requests
    if (request === undefined) throw new Error('PLAN_ROUTE_REQUEST_MISSING')
    expect(request.url).toInclude('/plan-route')
    expect(request.url).not.toInclude('/route-geometry')
    const body = await readJsonBody(request)
    expect(body.routeChoice).toEqual({ criterion: 'cheapest', signature: 'rota-mais-barata' })
  })
})

describe('TripRouteChoiceSwitch: switch do detalhe reaproveita RouteChoiceOptions e uma única leitura viva (spec 153 T405)', () => {
  const source = readFileSync(TRIP_ROUTE_CHOICE_SWITCH, 'utf8')

  it('busca a geometria viva uma única vez — trocar não refaz a chamada', () => {
    const chamadas = source.split('readPointsRouteGeometry').length - 1
    expect(chamadas).toBe(1)
  })

  it('a chave da consulta não inclui o índice/critério escolhido', () => {
    const queryKeyBlock = source.slice(
      source.indexOf('queryKey: '),
      source.indexOf('queryKey: ') + 200,
    )
    expect(queryKeyBlock).not.toInclude('selectedIndex')
    expect(queryKeyBlock).not.toInclude('criterion')
  })

  it('reaproveita RouteChoiceOptions (T402), não um seletor novo', () => {
    expect(source).toInclude("from './RouteChoiceOptions.component'")
    expect(source).toInclude('<RouteChoiceOptions')
  })

  /** A troca sai por `onSelect`, montada por `resolveRouteChoiceFromIndex` — nunca o índice cru. */
  it('a troca sai por onSelect, montada por resolveRouteChoiceFromIndex', () => {
    expect(source).toInclude('resolveRouteChoiceFromIndex')
    expect(source).toInclude('onSelect(')
  })

  /** Sem permissão de gerenciar/viagem editável, o switch nem consulta o roteirizador (D6/RF13). */
  it('só liga a consulta quando o switch pode aparecer (canSwitch)', () => {
    const queryBlock = source.slice(source.indexOf('useQuery('), source.indexOf('useQuery(') + 400)
    expect(queryBlock).toInclude('canSwitch')
  })
})

describe('TripRouteMap: monta o resumo e o switch de regravação (spec 153 T405)', () => {
  const source = readFileSync(TRIP_ROUTE_MAP, 'utf8')

  it('monta o switch de regravação abaixo do resumo de pedágio', () => {
    const tollIndex = source.indexOf('<RouteTollSummary')
    const switchIndex = source.indexOf('<TripRouteChoiceSwitch')
    expect(tollIndex).toBeGreaterThan(-1)
    expect(switchIndex).toBeGreaterThan(tollIndex)
  })

  it('monta o resumo de custo antes do resumo de pedágio', () => {
    const costIndex = source.indexOf('<TripRouteCostSummary')
    const tollIndex = source.indexOf('<RouteTollSummary')
    expect(costIndex).toBeGreaterThan(-1)
    expect(tollIndex).toBeGreaterThan(costIndex)
  })
})

describe('TripRouteCostSummary: rota gravada, km/volta/tempo, critério, avisos e dinheiro só com permissão (spec 153 T405)', () => {
  const source = readFileSync(TRIP_ROUTE_COST_SUMMARY, 'utf8')

  /** D9: tempo e volta ao barracão aparecem para todo mundo — não são dinheiro. */
  it('mostra tempo e a volta ao barracão, fora da trava de canReadFinancials', () => {
    expect(source).toInclude('routeMap.cost.duration')
    expect(source).toInclude('routeMap.cost.returnDistance')
    const durationIndex = source.indexOf('routeMap.cost.duration')
    const financialsGuardBefore = source.lastIndexOf('canReadFinancials', durationIndex)
    const dlStart = source.indexOf('<dl')
    /** A última menção de canReadFinancials antes do bloco de tempo é a da prop, não uma trava local. */
    expect(financialsGuardBefore).toBeLessThan(dlStart === -1 ? Number.POSITIVE_INFINITY : dlStart)
  })

  /** D3: aviso só quando a assinatura gravada não reproduziu — nunca a partir de um campo ausente. */
  it('avisa "escolha não reproduzida" só quando choiceReproduced é false, nunca ausente', () => {
    expect(source).toInclude('routeMap.choiceNotReproduced')
    expect(source).toInclude('choiceReproduced !== false')
  })

  /** D10: custo (combustível/pedágio/total) só imprime com a permissão — a linha some, não zera. */
  it('fuel/pedágio/total ficam atrás de canReadFinancials — a linha inteira some', () => {
    const dlBlock = source.slice(source.indexOf('<dl'), source.indexOf('</dl>'))
    expect(dlBlock).toInclude('!canReadFinancials')
  })

  it('mostra o critério da rota gravada', () => {
    expect(source).toInclude('geometry.criterion')
    expect(source).toInclude('routeMap.criterion')
  })
})

describe('TripDetail: liga a regravação do switch ao plan-route da viagem (spec 153 T405)', () => {
  const source = readFileSync(TRIP_DETAIL, 'utf8')

  it('onRouteChoiceSelect chama planRouteMutation com a escolha nova', () => {
    const propIndex = source.indexOf('onRouteChoiceSelect={')
    expect(propIndex).toBeGreaterThan(-1)
    const block = source.slice(propIndex, propIndex + 200)
    expect(block).toInclude('workspace.planRouteMutation.mutate')
    expect(block).toInclude('routeChoice')
  })

  /** RF13/D6: só quem gerencia e só antes do despacho vê o switch de regravação. */
  it('o switch só liga com canManage e viagem editável', () => {
    const propIndex = source.indexOf('canSwitchRoute={')
    expect(propIndex).toBeGreaterThan(-1)
    const block = source.slice(propIndex, propIndex + 80)
    expect(block).toInclude('canManage')
    expect(block).toInclude('isEditable')
  })
})
