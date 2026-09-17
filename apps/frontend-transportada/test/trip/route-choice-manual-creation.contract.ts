import { describe, expect, test } from 'bun:test'

import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN, TRIP_ID } from './trip.fixture'

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

type FinalizeQuickCreateRouteModule = Readonly<{
  finalizeQuickCreateRoute: (
    input: Readonly<{
      planRoute: () => Promise<void>
      reorderStops: () => Promise<void>
      shouldReorder: boolean
    }>,
  ) => Promise<void>
}>

function loadFinalizeQuickCreateRoute(): Promise<FinalizeQuickCreateRouteModule> {
  return loadFutureModule<FinalizeQuickCreateRouteModule>(
    '../../src/modules/trip/shared/finalizeQuickCreateRoute.service',
  )
}

/** A rota sem `routeChoice` hoje não manda corpo nenhum — `.json()` estouraria em vez de recusar. */
async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
}

describe('trip route choice on manual creation contract', () => {
  /**
   * ⚠️ RF3/D2: a criação manual precisa mandar o que o operador escolheu no seletor — critério e
   * assinatura — e não só o `tripId`. Sem isto o congelador nunca vê a escolha e sempre reproduz a
   * mais barata (o default do congelador, spec 153 T201), mesmo quando o operador pediu outra.
   */
  test('sends the operators chosen criterion and signature when planning the route', async () => {
    const requests: Request[] = []
    const client = await createPlanRouteRecordingClient(requests)

    await client.planTripRoute({
      routeChoice: { criterion: 'no_toll', signature: 'a1b2c3d4' },
      tripId: TRIP_ID,
    })

    const [planRequest] = requests
    if (planRequest === undefined) throw new Error('PLAN_ROUTE_REQUEST_MISSING')
    const body = await readJsonBody(planRequest)
    expect(Object.hasOwn(body, 'routeChoice')).toBe(true)
    expect(body.routeChoice).toEqual({ criterion: 'no_toll', signature: 'a1b2c3d4' })
  })

  /**
   * D1: a mais barata é o default da tela — o operador que nunca tocou o seletor aceitou essa opção,
   * e a criação manual diz isso ao servidor em vez de omitir a escolha inteira.
   */
  test('sends the default cheapest criterion even when the operator never touches the selector', async () => {
    const requests: Request[] = []
    const client = await createPlanRouteRecordingClient(requests)

    await client.planTripRoute({
      routeChoice: { criterion: 'cheapest', signature: null },
      tripId: TRIP_ID,
    })

    const [planRequest] = requests
    if (planRequest === undefined) throw new Error('PLAN_ROUTE_REQUEST_MISSING')
    const body = await readJsonBody(planRequest)
    expect(body.routeChoice).toEqual({ criterion: 'cheapest', signature: null })
  })

  /**
   * ⚠️ D6: reordenar paradas recalcula a rota congelada com `cheapest`, sempre — o congelador não
   * carrega a escolha do operador nessa chamada (confirmado em `reorder-trip-stops.use-case.ts`,
   * que chama `routeFreezer.freeze({ companyId, tripId })` sem `routeChoice`). Isto significa que,
   * se a criação manual planejar a rota **antes** de reordenar, a reordenação sobrescreve em
   * silêncio a rota escolhida pela mais barata — o operador pediu "sem pedágio" e a viagem nasce
   * com pedágio. A ordem certa é reordenar primeiro e planejar por último.
   */
  test('planning after reordering keeps the operators criterion; reordering after planning would discard it', async () => {
    const { finalizeQuickCreateRoute } = await loadFinalizeQuickCreateRoute()

    let frozenCriterion = 'cheapest'
    const planRoute = () => {
      frozenCriterion = 'fastest'
      return Promise.resolve()
    }
    const reorderStops = () => {
      frozenCriterion = 'cheapest'
      return Promise.resolve()
    }

    await finalizeQuickCreateRoute({ planRoute, reorderStops, shouldReorder: true })

    expect(frozenCriterion).toBe('fastest')
  })
})
