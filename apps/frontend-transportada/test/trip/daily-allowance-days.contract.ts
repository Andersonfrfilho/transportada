/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_TRIP_BODY,
  DRIVER_ID,
  loadFutureModule,
  SYNTHETIC_ACCESS_TOKEN,
  TRIP_DETAIL,
  VEHICLE_ID,
} from './trip.fixture'

const API_URL = 'https://api.example.test'

const QUICK_CREATE_HOOK_PATH = 'src/modules/trip/hooks/useTripQuickCreate.hook.ts'
const DIALOG_PATH = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const VALUATION_PREVIEW_HOOK_PATH =
  'src/modules/trip-financials/hooks/useTripValuationPreview.hook.ts'
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type QuickCreateModule = Readonly<{
  resolveDailyAllowanceDaysInput: (value: string) => number | undefined
}>

function loadQuickCreate(): Promise<QuickCreateModule> {
  return loadFutureModule<QuickCreateModule>(
    '../../src/modules/trip/shared/tripQuickCreate.service',
  )
}

type CreateTripInput = Readonly<{
  dailyAllowanceDays?: number
  driverIds: readonly string[]
  vehicleId: string
}>

type TripClientModule = Readonly<{
  createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => Readonly<{ createTrip: (input: CreateTripInput) => Promise<unknown> }>
}>

async function createTripRecordingClient(
  requests: Request[],
): Promise<Readonly<{ createTrip: (input: CreateTripInput) => Promise<unknown> }>> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({ data: TRIP_DETAIL }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

type PreviewValuationInput = Readonly<{
  dailyAllowanceDays?: number
  driverIds: readonly string[]
  nfeDocumentIds: readonly string[]
  stopOrder: readonly string[]
  vehicleId: string
}>

type TripFinancialsClientModule = Readonly<{
  createTripFinancialsClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => Readonly<{ previewValuation: (input: PreviewValuationInput) => Promise<unknown> }>
}>

async function createValuationRecordingClient(
  requests: Request[],
): Promise<Readonly<{ previewValuation: (input: PreviewValuationInput) => Promise<unknown> }>> {
  const { createTripFinancialsClient } = await loadFutureModule<TripFinancialsClientModule>(
    '../../src/modules/trip-financials/shared/tripFinancialsClient.service',
  )
  return createTripFinancialsClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({}))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('trip daily allowance days contract', () => {
  /** Spec 143 D4: o inteiro só é aceito a partir de `1` — vazio, `0` e negativo nunca vão à rede. */
  test('resolves a typed value to a positive integer, and rejects empty, zero and negative input', async () => {
    const { resolveDailyAllowanceDaysInput } = await loadQuickCreate()

    expect(resolveDailyAllowanceDaysInput('')).toBeUndefined()
    expect(resolveDailyAllowanceDaysInput('   ')).toBeUndefined()
    expect(resolveDailyAllowanceDaysInput('0')).toBeUndefined()
    expect(resolveDailyAllowanceDaysInput('-3')).toBeUndefined()
    expect(resolveDailyAllowanceDaysInput('abc')).toBeUndefined()
    expect(resolveDailyAllowanceDaysInput('4')).toBe(4)
    expect(resolveDailyAllowanceDaysInput(' 4 ')).toBe(4)
  })

  /**
   * ⚠️ `Object.hasOwn`, não `undefined`: o zod é `.optional()` sem `.default()`, e ausente significa
   * "sugere pela duração estimada" — mandar a chave com `undefined` não é a mesma coisa no JSON.
   */
  test('an empty field never reaches the network: the create-trip body omits the key entirely', async () => {
    const requests: Request[] = []
    const client = await createTripRecordingClient(requests)

    await client.createTrip(CREATE_TRIP_BODY)

    const [createRequest] = requests
    if (createRequest === undefined) throw new Error('DAILY_ALLOWANCE_DAYS_REQUEST_MISSING')
    const body = (await createRequest.json()) as Record<string, unknown>
    expect(Object.hasOwn(body, 'dailyAllowanceDays')).toBe(false)
  })

  test('a filled field sends the value as a plain number in the create-trip body', async () => {
    const requests: Request[] = []
    const client = await createTripRecordingClient(requests)

    await client.createTrip({ ...CREATE_TRIP_BODY, dailyAllowanceDays: 5 })

    const [createRequest] = requests
    if (createRequest === undefined) throw new Error('DAILY_ALLOWANCE_DAYS_REQUEST_MISSING')
    const body = (await createRequest.json()) as Record<string, unknown>
    expect(Object.hasOwn(body, 'dailyAllowanceDays')).toBe(true)
    expect(body.dailyAllowanceDays).toBe(5)
  })

  /**
   * ⚠️ Mandar só na criação é o defeito que a task existe para evitar: a prévia é o que promete a
   * margem, e ela precisa do mesmo campo para não divergir da viagem que vai nascer.
   */
  test('the valuation preview carries the same value, and omits it when the field is empty', async () => {
    const requests: Request[] = []
    const client = await createValuationRecordingClient(requests)

    await client.previewValuation({
      driverIds: [DRIVER_ID],
      nfeDocumentIds: [],
      stopOrder: [],
      vehicleId: VEHICLE_ID,
    })
    await client.previewValuation({
      dailyAllowanceDays: 3,
      driverIds: [DRIVER_ID],
      nfeDocumentIds: [],
      stopOrder: [],
      vehicleId: VEHICLE_ID,
    })

    const [withoutDaysRequest, withDaysRequest] = requests
    if (withoutDaysRequest === undefined || withDaysRequest === undefined) {
      throw new Error('DAILY_ALLOWANCE_DAYS_REQUEST_MISSING')
    }

    const withoutDaysBody = (await withoutDaysRequest.json()) as Record<string, unknown>
    expect(Object.hasOwn(withoutDaysBody, 'dailyAllowanceDays')).toBe(false)

    const withDaysBody = (await withDaysRequest.json()) as Record<string, unknown>
    expect(Object.hasOwn(withDaysBody, 'dailyAllowanceDays')).toBe(true)
    expect(withDaysBody.dailyAllowanceDays).toBe(3)
  })

  /**
   * Sem o campo na chave da consulta, digitar um novo valor não dispararia recálculo nenhum.
   * ⚠️ O recorte é pelo bloco do array, não por uma única linha: o `prettier` quebra o `queryKey`
   * em várias linhas quando ele não cabe em 100 colunas, e isso não é o que o teste quer provar.
   */
  test('the days value is part of the preview query key, forcing a new calculation when it changes', async () => {
    const hook = await readApplicationFile(VALUATION_PREVIEW_HOOK_PATH)

    const queryKeyStart = hook.indexOf('queryKey: [')
    expect(queryKeyStart).toBeGreaterThan(-1)
    const queryKeyEnd = hook.indexOf(']', queryKeyStart)
    const queryKeyBlock = hook.slice(queryKeyStart, queryKeyEnd)
    expect(queryKeyBlock.includes('TRIP_VALUATION_PREVIEW_QUERY_KEY')).toBe(true)
    expect(queryKeyBlock.includes('dailyAllowanceDays')).toBe(true)
  })

  test('the dialog and the controller hook wire the typed days into both network calls', async () => {
    const [dialog, hook] = await Promise.all([
      readApplicationFile(DIALOG_PATH),
      readApplicationFile(QUICK_CREATE_HOOK_PATH),
    ])

    expect(dialog).toContain('dailyAllowanceDaysInput')
    expect(hook).toContain('resolveDailyAllowanceDaysInput')
    expect(hook).toContain('dailyAllowanceDays')
  })

  /**
   * A sugestão é da API (`suggestAllowanceDays`), nunca reimplementada no FE — duas contas
   * divergiriam no primeiro caso de fronteira (24h01 vira 2 dias numa e 1 dia na outra).
   */
  test('the suggested day count on screen never comes from a local 86400-based computation', async () => {
    const files = await Promise.all(
      [QUICK_CREATE_HOOK_PATH, DIALOG_PATH, VALUATION_PREVIEW_HOOK_PATH].map(readApplicationFile),
    )

    for (const fileText of files) {
      expect(fileText).not.toContain('86400')
    }
  })
})
