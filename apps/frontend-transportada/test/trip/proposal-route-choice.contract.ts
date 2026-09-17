/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T404 (D7): a proposta com mais de um veículo grava **uma escolha de rota por veículo**,
 * nunca uma só compartilhada. D2: a escolha é identificada por `signature` + `criterion`, nunca por
 * índice — com dois veículos um índice não diria de qual lista. D1: quem nunca tocou o seletor
 * ainda manda `cheapest` explícito, em todo veículo aceito.
 *
 * Sem harness de render (confirmado em `test/nfe-workspace/package-box-measurement.contract.ts`), a
 * decisão por veículo mora em funções puras (`proposalRouteChoice.service.ts`), testadas aqui
 * diretamente; o fio até a tela é provado por leitura de fonte, no molde de
 * `test/trip/route-choice-switch.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN, VEHICLE_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'
const SECOND_VEHICLE_ID = '00000000-0000-4000-8000-000000000922'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000a31'

type RouteChoice = Readonly<{
  criterion: 'alternative' | 'cheapest' | 'fastest' | 'no_toll'
  signature: null | string
}>

const CHEAPEST_DEFAULT: RouteChoice = { criterion: 'cheapest', signature: null }

/* -------------------------------------------------------------------------------------------- *
 * resolveVehicleRouteChoice / resolveAcceptedRouteChoices — o núcleo testável de D7.
 * -------------------------------------------------------------------------------------------- */

type ProposalRouteChoiceModule = Readonly<{
  resolveAcceptedRouteChoices: (
    input: Readonly<{
      routeChoiceByVehicle: ReadonlyMap<string, RouteChoice>
      vehicleIds: readonly string[]
    }>,
  ) => readonly Readonly<{ routeChoice: RouteChoice; vehicleId: string }>[]
  resolveVehicleRouteChoice: (
    input: Readonly<{ routeChoiceByVehicle: ReadonlyMap<string, RouteChoice>; vehicleId: string }>,
  ) => RouteChoice
}>

function loadProposalRouteChoice(): Promise<ProposalRouteChoiceModule> {
  return loadFutureModule<ProposalRouteChoiceModule>(
    '../../src/modules/trip/shared/proposalRouteChoice.service',
  )
}

describe('proposalRouteChoice.service (spec 153 T404 / D7)', () => {
  /**
   * ⚠️ A asserção que mais importa: dois veículos com escolhas diferentes continuam diferentes ao
   * serem lidos de volta — um teste de um veículo só não prova isolamento nenhum.
   */
  test('cada veículo lê a própria escolha — a de um nunca vaza para o outro', async () => {
    const { resolveVehicleRouteChoice } = await loadProposalRouteChoice()
    const routeChoiceByVehicle = new Map<string, RouteChoice>([
      [VEHICLE_ID, { criterion: 'fastest', signature: 'rota-a' }],
      [SECOND_VEHICLE_ID, { criterion: 'no_toll', signature: 'rota-b' }],
    ])

    const first = resolveVehicleRouteChoice({ routeChoiceByVehicle, vehicleId: VEHICLE_ID })
    const second = resolveVehicleRouteChoice({
      routeChoiceByVehicle,
      vehicleId: SECOND_VEHICLE_ID,
    })

    expect(first).toEqual({ criterion: 'fastest', signature: 'rota-a' })
    expect(second).toEqual({ criterion: 'no_toll', signature: 'rota-b' })
    expect(first).not.toEqual(second)
  })

  /** D1: veículo ausente do mapa nunca é indefinido — a mais barata é a escolha explícita dele. */
  test('veículo sem escolha registrada resolve para cheapest explícito, nunca ausente', async () => {
    const { resolveVehicleRouteChoice } = await loadProposalRouteChoice()

    const choice = resolveVehicleRouteChoice({
      routeChoiceByVehicle: new Map(),
      vehicleId: VEHICLE_ID,
    })

    expect(choice).toEqual(CHEAPEST_DEFAULT)
  })

  /**
   * O aceite manda um item por veículo aceito, sempre — o veículo que o operador tocou com a
   * escolha dele, o que não tocou com `cheapest` explícito, e nunca os dois trocados de lugar.
   */
  test('resolveAcceptedRouteChoices devolve uma entrada por veículo, pareada e nunca trocada', async () => {
    const { resolveAcceptedRouteChoices } = await loadProposalRouteChoice()
    const routeChoiceByVehicle = new Map<string, RouteChoice>([
      [VEHICLE_ID, { criterion: 'fastest', signature: 'rota-a' }],
    ])

    const accepted = resolveAcceptedRouteChoices({
      routeChoiceByVehicle,
      vehicleIds: [VEHICLE_ID, SECOND_VEHICLE_ID],
    })

    expect(accepted).toEqual([
      { routeChoice: { criterion: 'fastest', signature: 'rota-a' }, vehicleId: VEHICLE_ID },
      { routeChoice: CHEAPEST_DEFAULT, vehicleId: SECOND_VEHICLE_ID },
    ])
  })
})

/* -------------------------------------------------------------------------------------------- *
 * Aceite: `routeChoiceByVehicle` no corpo de `acceptMultiVehicleSuggestion`.
 * -------------------------------------------------------------------------------------------- */

type AcceptMultiVehicleSuggestionInput = Readonly<{
  routeChoiceByVehicle?: readonly Readonly<{ routeChoice: RouteChoice; vehicleId: string }>[]
  suggestionId: string
  vehicleIds?: readonly string[]
}>

type TripClientModule = Readonly<{
  createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => Readonly<{
    acceptMultiVehicleSuggestion: (input: AcceptMultiVehicleSuggestionInput) => Promise<unknown>
  }>
}>

async function createAcceptRecordingClient(requests: Request[]): Promise<
  Readonly<{
    acceptMultiVehicleSuggestion: (input: AcceptMultiVehicleSuggestionInput) => Promise<unknown>
  }>
> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(
        Response.json({
          data: { suggestion: { id: SUGGESTION_ID, status: 'accepted' }, trips: [] },
        }),
      )
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

/** A rota sem corpo hoje não manda nada — `.json()` estouraria em vez de recusar. */
async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
}

describe('acceptMultiVehicleSuggestion manda a escolha de rota por veículo (spec 153 T404 / D7)', () => {
  test('cada veículo aceito manda a própria escolha, nunca a de outro', async () => {
    const requests: Request[] = []
    const client = await createAcceptRecordingClient(requests)

    await client.acceptMultiVehicleSuggestion({
      routeChoiceByVehicle: [
        { routeChoice: { criterion: 'fastest', signature: 'rota-a' }, vehicleId: VEHICLE_ID },
        {
          routeChoice: { criterion: 'no_toll', signature: 'rota-b' },
          vehicleId: SECOND_VEHICLE_ID,
        },
      ],
      suggestionId: SUGGESTION_ID,
    })

    const [acceptRequest] = requests
    if (acceptRequest === undefined) throw new Error('ACCEPT_REQUEST_MISSING')
    const body = await readJsonBody(acceptRequest)
    expect(body.routeChoiceByVehicle).toEqual([
      { routeChoice: { criterion: 'fastest', signature: 'rota-a' }, vehicleId: VEHICLE_ID },
      { routeChoice: { criterion: 'no_toll', signature: 'rota-b' }, vehicleId: SECOND_VEHICLE_ID },
    ])
  })

  /** D1: o veículo que ninguém tocou ainda manda `cheapest` explícito — nunca omitido do corpo. */
  test('veículo cuja escolha ninguém tocou ainda manda cheapest explícito no aceite', async () => {
    const requests: Request[] = []
    const client = await createAcceptRecordingClient(requests)

    await client.acceptMultiVehicleSuggestion({
      routeChoiceByVehicle: [{ routeChoice: CHEAPEST_DEFAULT, vehicleId: VEHICLE_ID }],
      suggestionId: SUGGESTION_ID,
    })

    const [acceptRequest] = requests
    if (acceptRequest === undefined) throw new Error('ACCEPT_REQUEST_MISSING')
    const body = await readJsonBody(acceptRequest)
    expect(Object.hasOwn(body, 'routeChoiceByVehicle')).toBe(true)
    expect(body.routeChoiceByVehicle).toEqual([
      { routeChoice: CHEAPEST_DEFAULT, vehicleId: VEHICLE_ID },
    ])
  })
})

/* -------------------------------------------------------------------------------------------- *
 * Prévia: `routeChoice` no corpo de `previewValuation`.
 * -------------------------------------------------------------------------------------------- */

type PreviewValuationInput = Readonly<{
  dailyAllowanceDays?: number
  driverIds: readonly string[]
  nfeDocumentIds: readonly string[]
  routeChoice?: RouteChoice
  stopOrder: readonly string[]
  vehicleId: string
}>

type TripFinancialsClientModule = Readonly<{
  createTripFinancialsClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => Readonly<{
    previewValuation: (input: PreviewValuationInput) => Promise<unknown>
  }>
}>

async function createPreviewValuationRecordingClient(
  requests: Request[],
): Promise<Readonly<{ previewValuation: (input: PreviewValuationInput) => Promise<unknown> }>> {
  const { createTripFinancialsClient } = await loadFutureModule<TripFinancialsClientModule>(
    '../../src/modules/trip-financials/shared/tripFinancialsClient.service',
  )
  return createTripFinancialsClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({ data: null }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('previewValuation manda a rota escolhida do veículo (spec 153 T404 / D7/D2)', () => {
  test('a prévia manda o critério e a assinatura da rota escolhida deste veículo', async () => {
    const requests: Request[] = []
    const client = await createPreviewValuationRecordingClient(requests)

    await client.previewValuation({
      driverIds: [],
      nfeDocumentIds: ['nota-1'],
      routeChoice: { criterion: 'no_toll', signature: 'rota-c' },
      stopOrder: ['cidade:1'],
      vehicleId: VEHICLE_ID,
    })

    const [previewRequest] = requests
    if (previewRequest === undefined) throw new Error('PREVIEW_REQUEST_MISSING')
    const body = await readJsonBody(previewRequest)
    expect(body.routeChoice).toEqual({ criterion: 'no_toll', signature: 'rota-c' })
  })

  /**
   * Duas chamadas, um veículo cada: a segunda não pode herdar a escolha da primeira — cada corpo é
   * a prévia de um único veículo, e é assim que dois veículos na mesma proposta não se confundem.
   */
  test('duas chamadas para dois veículos não compartilham a escolha de rota', async () => {
    const requests: Request[] = []
    const client = await createPreviewValuationRecordingClient(requests)

    await client.previewValuation({
      driverIds: [],
      nfeDocumentIds: ['nota-1'],
      routeChoice: { criterion: 'fastest', signature: 'rota-a' },
      stopOrder: ['cidade:1'],
      vehicleId: VEHICLE_ID,
    })
    await client.previewValuation({
      driverIds: [],
      nfeDocumentIds: ['nota-2'],
      routeChoice: { criterion: 'no_toll', signature: 'rota-b' },
      stopOrder: ['cidade:2'],
      vehicleId: SECOND_VEHICLE_ID,
    })

    const [firstRequest, secondRequest] = requests
    if (firstRequest === undefined || secondRequest === undefined) {
      throw new Error('PREVIEW_REQUEST_MISSING')
    }
    const firstBody = await readJsonBody(firstRequest)
    const secondBody = await readJsonBody(secondRequest)
    expect(firstBody.routeChoice).toEqual({ criterion: 'fastest', signature: 'rota-a' })
    expect(secondBody.routeChoice).toEqual({ criterion: 'no_toll', signature: 'rota-b' })
    expect(firstBody.routeChoice).not.toEqual(secondBody.routeChoice)
  })
})

/* -------------------------------------------------------------------------------------------- *
 * Fio até a tela: cada peça lê/escreve a escolha do **seu** veículo, nunca uma global.
 * -------------------------------------------------------------------------------------------- */

const TRIP_PROPOSAL_DETAIL = new URL(
  '../../src/modules/trip/components/TripProposalDetail.component.tsx',
  import.meta.url,
)
const USE_TRIP_ROUTE_ASSEMBLY = new URL(
  '../../src/modules/trip/hooks/useTripRouteAssembly.hook.ts',
  import.meta.url,
)
const TRIP_ROUTE_ASSEMBLY_DIALOG = new URL(
  '../../src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
  import.meta.url,
)
const USE_TRIP_VALUATION_PREVIEW = new URL(
  '../../src/modules/trip-financials/hooks/useTripValuationPreview.hook.ts',
  import.meta.url,
)
const TRIP_FINANCIALS_CLIENT = new URL(
  '../../src/modules/trip-financials/shared/tripFinancialsClient.service.ts',
  import.meta.url,
)

describe('TripProposalDetail: recebe e repassa a escolha do próprio veículo (spec 153 T404)', () => {
  const source = readFileSync(TRIP_PROPOSAL_DETAIL, 'utf8')

  test('a prop de escolha e o callback de troca existem, tipados por RouteChoice', () => {
    expect(source).toInclude("import type { RouteChoice } from '../shared/routeGeometry.service'")
    expect(source).toInclude('routeChoice: RouteChoice')
    expect(source).toInclude('onRouteChoiceChange: (routeChoice: RouteChoice) => void')
  })

  test('repassa a escolha e o callback ao mapa da montagem', () => {
    const mapBlock = source.slice(
      source.indexOf('<TripAssemblyMap'),
      source.indexOf('<TripAssemblyMap') + 800,
    )
    expect(mapBlock).toInclude('onRouteChoiceChange={onRouteChoiceChange}')
  })

  test('a prévia da conta mede sobre a mesma escolha que o mapa mostra', () => {
    const previewBlock = source.slice(
      source.indexOf('useTripValuationPreview({'),
      source.indexOf('useTripValuationPreview({') + 400,
    )
    expect(previewBlock).toInclude('routeChoice')
  })
})

describe('useTripRouteAssembly: uma escolha de rota por veículo, nunca uma só (spec 153 T404 / D7)', () => {
  const source = readFileSync(USE_TRIP_ROUTE_ASSEMBLY, 'utf8')

  test('o estado é um mapa por veículo, não um valor único', () => {
    expect(source).toInclude('routeChoiceByVehicle')
    /** `[\s\S]` porque o Prettier pode quebrar a anotação de tipo em mais de uma linha. */
    expect(source).toMatch(/routeChoiceByVehicle[\s\S]*ReadonlyMap<string, RouteChoice>/u)
  })

  test('expõe um setter por veículo para a tela gravar a escolha dele', () => {
    expect(source).toInclude('setVehicleRouteChoice')
  })

  /** D1: o aceite nunca omite a escolha — ela vai sempre, ao contrário da ordem manual. */
  test('o aceite manda routeChoiceByVehicle sempre, nunca condicionado a estar vazio', () => {
    expect(source).toInclude('resolveAcceptedRouteChoices')
    const acceptBodyBlock = source.slice(
      source.indexOf('acceptMultiVehicleSuggestion({'),
      source.indexOf('acceptMultiVehicleSuggestion({') + 700,
    )
    expect(acceptBodyBlock).toInclude('routeChoiceByVehicle:')
    expect(acceptBodyBlock).not.toMatch(/routeChoiceByVehicle\.length === 0/u)
  })

  /** A proposta nova e o aceite bem-sucedido não podem carregar a escolha da proposta anterior. */
  test('a escolha por veículo é limpa ao propor de novo e ao aceitar', () => {
    const resets = source.split('setRouteChoiceByVehicle(new Map())').length - 1
    expect(resets).toBe(2)
  })
})

describe('TripRouteAssemblyDialog: cada linha lê a escolha do próprio veículo (spec 153 T404 / D7)', () => {
  const source = readFileSync(TRIP_ROUTE_ASSEMBLY_DIALOG, 'utf8')

  test('usa resolveVehicleRouteChoice, nunca um valor lido fora do laço por veículo', () => {
    expect(source).toInclude(
      "import { resolveVehicleRouteChoice } from '../shared/proposalRouteChoice.service'",
    )
  })

  test('a linha do veículo passa a própria escolha e o próprio callback de troca', () => {
    const detailBlock = source.slice(
      source.indexOf('<TripProposalDetail'),
      source.indexOf('<TripProposalDetail') + 1_500,
    )
    expect(detailBlock).toInclude('routeChoice={resolveVehicleRouteChoice(')
    expect(detailBlock).toInclude('vehicleId: view.vehicleId')
    expect(detailBlock).toInclude('assembly.setVehicleRouteChoice(view.vehicleId, routeChoice)')
  })
})

describe('useTripValuationPreview: a escolha de rota entra na consulta (spec 153 T404 / D7)', () => {
  const source = readFileSync(USE_TRIP_VALUATION_PREVIEW, 'utf8')

  test('recebe routeChoice e o inclui na chave da consulta', () => {
    expect(source).toInclude('routeChoice')
    const queryKeyBlock = source.slice(
      source.indexOf('queryKey: ['),
      source.indexOf('queryKey: [') + 300,
    )
    expect(queryKeyBlock).toInclude('routeChoice')
  })
})

describe('tripFinancialsClient: previewValuation aceita a escolha de rota (spec 153 T404 / D7)', () => {
  const source = readFileSync(TRIP_FINANCIALS_CLIENT, 'utf8')

  test('o tipo do pedido carrega routeChoice opcional, do mesmo tipo que a montagem usa', () => {
    expect(source).toInclude(
      "import type { RouteChoice } from '@/modules/trip/shared/routeGeometry.service'",
    )
    expect(source).toInclude('routeChoice?: RouteChoice')
  })
})
