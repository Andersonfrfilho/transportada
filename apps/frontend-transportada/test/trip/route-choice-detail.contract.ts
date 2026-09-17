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
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import { createTripRouteChoiceQueryOptions } from '../../src/modules/trip/components/TripRouteChoiceSwitch.component'
import { resolveRouteChoiceFromIndex } from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type {
  RouteGeometry,
  RouteGeometryOption,
} from '../../src/modules/trip/shared/routeGeometry.service'
import { TRIP_QUERY_KEY } from '../../src/modules/trip/shared/trip.constant'
import type { TripClient } from '../../src/modules/trip/shared/tripClient.service'
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

describe('regravação no detalhe: plan-route serializa a escolha nova (spec 153 T405/RF13)', () => {
  /**
   * Prova só a serialização do corpo: a escolha resolvida a partir de opções já em mãos vira
   * `{ criterion, signature }` no POST de `/plan-route`. A garantia de que a troca não refaz a
   * busca ao roteirizador é da suíte abaixo, com `QueryObserver` sobre a query real — aqui não há
   * nenhuma leitura viva envolvida, só o client de regravação.
   */
  test('trocar mais rápida ↔ mais barata regrava via plan-route usando as opções já buscadas', async () => {
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

describe('TripRouteChoiceSwitch: comportamento real da query — busca uma vez, sobrevive ao invalidate do plan-route (spec 153 T706/RF13/M6)', () => {
  const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
  const POINTS = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -22.9, longitude: -43.2 },
  ] as const

  const GEOMETRY_OPTIONS: readonly RouteGeometryOption[] = [
    opcao({ signature: 'rota-mais-rapida' }),
    opcao({ signature: 'rota-mais-barata' }),
  ]

  /**
   * Observador real do TanStack sobre `createTripRouteChoiceQueryOptions` — a mesma função que o
   * componente chama. Nenhuma leitura de fonte: quem decide se o `queryFn` dispara é o próprio
   * `QueryObserver`, como no navegador (mesmo molde de `test/identity/user-picture.contract.ts`).
   */
  function createGeometryObserver(input: Readonly<{ queryClient: QueryClient }>): Readonly<{
    observer: QueryObserver<RouteGeometry>
    requestCount: () => number
  }> {
    let requests = 0
    const client = {
      readPointsRouteGeometry: () => {
        requests += 1
        return Promise.resolve({
          cheapestIndex: 1,
          costGap: null,
          fastestIndex: 0,
          legs: [],
          options: GEOMETRY_OPTIONS,
          points: [],
          toll: null,
        })
      },
    } as unknown as TripClient
    const observer = new QueryObserver<RouteGeometry>(
      input.queryClient,
      createTripRouteChoiceQueryOptions({
        client,
        enabled: true,
        points: POINTS,
        vehicleId: null,
      }),
    )
    return { observer, requestCount: () => requests }
  }

  /**
   * ⚠️ As chaves são as reais que `invalidate()` de `useTripWorkspace.hook.ts` dispara pós
   * `plan-route`: `[TRIP_QUERY_KEY, companyId, tripId]` (a viagem) e `[TRIP_QUERY_KEY]` (a lista).
   * Se a query de geometria fosse prefixada por `TRIP_QUERY_KEY` (`'trips'`), o `invalidateQueries`
   * por prefixo a alcançaria e o observer refaria a busca — o defeito que este teste existe para
   * pegar. Prefixo hoje é `'trip-detail-route-choice'`, então a contagem some em 1.
   */
  async function invalidateAsPlanRouteDoes(queryClient: QueryClient): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY, COMPANY_ID, TRIP_ID] }),
      queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] }),
    ])
  }

  test('busca a geometria uma única vez, e o invalidate pós plan-route não refaz a busca', async () => {
    const queryClient = new QueryClient()
    const { observer, requestCount } = createGeometryObserver({ queryClient })
    const unsubscribe = observer.subscribe(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(requestCount()).toBe(1)

    await invalidateAsPlanRouteDoes(queryClient)
    await new Promise((resolve) => setTimeout(resolve, 10))

    unsubscribe()
    expect(requestCount()).toBe(1)
  })

  test('a troca dispara plan-route com a escolha nova, montada com as opções que a mesma busca trouxe', async () => {
    const queryClient = new QueryClient()
    const { observer, requestCount } = createGeometryObserver({ queryClient })
    const unsubscribe = observer.subscribe(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 10))
    unsubscribe()

    const geometry = observer.getCurrentResult().data
    if (geometry === undefined) throw new Error('GEOMETRY_QUERY_DID_NOT_RESOLVE')

    /** É exatamente o que `handleSelect` do componente faz ao trocar para "mais barata" (índice 1). */
    const routeChoice = resolveRouteChoiceFromIndex({
      cheapestIndex: geometry.cheapestIndex ?? null,
      fastestIndex: geometry.fastestIndex ?? null,
      index: 1,
      options: geometry.options ?? [],
    })

    const planRouteRequests: Request[] = []
    const client = await createPlanRouteRecordingClient(planRouteRequests)
    await client.planTripRoute({ routeChoice, tripId: TRIP_ID })

    expect(requestCount()).toBe(1)
    expect(planRouteRequests).toHaveLength(1)
    const [request] = planRouteRequests
    if (request === undefined) throw new Error('PLAN_ROUTE_REQUEST_MISSING')
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
