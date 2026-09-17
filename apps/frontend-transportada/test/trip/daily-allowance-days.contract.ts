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
const LOCALE_PATHS = [
  'src/modules/trip/locales/trip.locale.json',
  'src/modules/trip/locales/trip.en.locale.json',
]
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type DailyAllowanceDaysReading =
  | Readonly<{ of: 'absent' }>
  | Readonly<{ days: number; of: 'informed' }>
  | Readonly<{ of: 'invalid' }>

type DriverParcelValuation = Readonly<{
  costParcels: readonly Readonly<{
    basis: null | Readonly<{ days: number; daysOrigin: string; of: string }>
  }>[]
}>

type DailyAllowanceFieldModule = Readonly<{
  displayDailyAllowanceDays: (
    input: Readonly<{ suggestedDays: number | undefined; typed: string | undefined }>,
  ) => string
  readDailyAllowanceDaysInput: (value: string) => DailyAllowanceDaysReading
  readSuggestedDailyAllowanceDays: (valuation: null | DriverParcelValuation) => number | undefined
}>

function loadDailyAllowanceField(): Promise<DailyAllowanceFieldModule> {
  return loadFutureModule<DailyAllowanceFieldModule>(
    '../../src/modules/trip/shared/dailyAllowanceDaysField.service',
  )
}

type QuickCreateModule = Readonly<{
  validateQuickCreate: (
    input: Readonly<{
      dailyAllowanceDays: DailyAllowanceDaysReading
      driverIds: readonly string[]
      queue: readonly unknown[]
      vehicleId: string
    }>,
  ) => readonly string[]
}>

function loadQuickCreate(): Promise<QuickCreateModule> {
  return loadFutureModule<QuickCreateModule>(
    '../../src/modules/trip/shared/tripQuickCreate.service',
  )
}

function valuationWithDriverDays(
  input: Readonly<{ days: number; daysOrigin: string }>,
): DriverParcelValuation {
  return {
    costParcels: [
      { basis: null },
      { basis: { days: input.days, daysOrigin: input.daysOrigin, of: 'driver' } },
    ],
  }
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
  /**
   * ⚠️ Ausente e inválido são **estados diferentes**. Colapsar os dois faz `2,5` virar silenciosamente
   * a estimativa do servidor: o operador digitou um número, viu o campo aceitar, e a viagem nasceu
   * com outro valor — sem uma linha na tela dizendo que o que ele escreveu foi descartado.
   */
  test('reads an empty field as absent, a positive integer as informed, and anything else as invalid', async () => {
    const { readDailyAllowanceDaysInput } = await loadDailyAllowanceField()

    expect(readDailyAllowanceDaysInput('')).toEqual({ of: 'absent' })
    expect(readDailyAllowanceDaysInput('   ')).toEqual({ of: 'absent' })
    expect(readDailyAllowanceDaysInput('4')).toEqual({ days: 4, of: 'informed' })
    expect(readDailyAllowanceDaysInput(' 4 ')).toEqual({ days: 4, of: 'informed' })
    expect(readDailyAllowanceDaysInput('04')).toEqual({ days: 4, of: 'informed' })

    /** O último é o que a coluna `integer` não guarda: recusado aqui, e não em 500 no banco. */
    for (const typed of ['0', '00', '-3', 'abc', '2,5', '2.5', '1e3', '+4', '9999999999']) {
      expect(readDailyAllowanceDaysInput(typed)).toEqual({ of: 'invalid' })
    }
  })

  /** Nenhuma leitura inválida carrega número: o que não é diária não tem como chegar ao corpo. */
  test('no invalid entry ever produces a day count', async () => {
    const { readDailyAllowanceDaysInput } = await loadDailyAllowanceField()

    for (const typed of ['0', '-3', 'abc', '2,5', '', '   ']) {
      expect(readDailyAllowanceDaysInput(typed).of).not.toBe('informed')
    }
  })

  /** O inválido **trava o botão**, o ausente não: campo vazio é uma escolha, `2,5` é um engano. */
  test('an invalid day count blocks the creation, and an empty field does not', async () => {
    const { validateQuickCreate } = await loadQuickCreate()

    const invalid = validateQuickCreate({
      dailyAllowanceDays: { of: 'invalid' },
      driverIds: [DRIVER_ID],
      queue: [],
      vehicleId: VEHICLE_ID,
    })
    expect(invalid).toContain('dailyAllowanceDaysInvalid')

    for (const reading of [{ of: 'absent' } as const, { days: 2, of: 'informed' } as const]) {
      const issues = validateQuickCreate({
        dailyAllowanceDays: reading,
        driverIds: [DRIVER_ID],
        queue: [],
        vehicleId: VEHICLE_ID,
      })
      expect(issues).not.toContain('dailyAllowanceDaysInvalid')
    }
  })

  /** Recusa sem frase é recusa muda: o botão desligado precisa dizer por quê, em cada idioma. */
  test('every locale names the invalid day count', async () => {
    const locales = await Promise.all(LOCALE_PATHS.map(readApplicationFile))

    for (const locale of locales) {
      const dictionary = JSON.parse(locale) as Record<
        string,
        Record<string, Record<string, string>>
      >
      const sentence = dictionary.quickCreate?.issue?.dailyAllowanceDaysInvalid
      expect(typeof sentence).toBe('string')
      expect(sentence).not.toBe('')
    }
  })

  /**
   * Spec 143 D4: o campo abre **preenchido com a sugestão**. `undefined` é "ninguém digitou ainda";
   * `''` é o operador que apagou de propósito — e apagado não pode ser reescrito pela sugestão, ou a
   * tela desfaz o que ele acabou de fazer a cada resposta da prévia.
   */
  test('the field shows the suggestion until it is typed, and never overwrites what was typed', async () => {
    const { displayDailyAllowanceDays } = await loadDailyAllowanceField()

    expect(displayDailyAllowanceDays({ suggestedDays: 3, typed: undefined })).toBe('3')
    expect(displayDailyAllowanceDays({ suggestedDays: undefined, typed: undefined })).toBe('')
    expect(displayDailyAllowanceDays({ suggestedDays: 3, typed: '2' })).toBe('2')
    expect(displayDailyAllowanceDays({ suggestedDays: 3, typed: '' })).toBe('')
    expect(displayDailyAllowanceDays({ suggestedDays: 7, typed: '2,5' })).toBe('2,5')
  })

  /**
   * A sugestão só existe enquanto a API **estima**. Depois que o operador informou, a resposta volta
   * `informed` com o número dele — reoferecê-lo como sugestão seria a tela sugerindo a si mesma.
   */
  test('the suggestion comes from the estimated driver parcel, and from nowhere else', async () => {
    const { readSuggestedDailyAllowanceDays } = await loadDailyAllowanceField()

    expect(
      readSuggestedDailyAllowanceDays(
        valuationWithDriverDays({ days: 3, daysOrigin: 'estimated' }),
      ),
    ).toBe(3)
    expect(
      readSuggestedDailyAllowanceDays(valuationWithDriverDays({ days: 3, daysOrigin: 'informed' })),
    ).toBeUndefined()
    expect(readSuggestedDailyAllowanceDays(null)).toBeUndefined()
    expect(readSuggestedDailyAllowanceDays({ costParcels: [] })).toBeUndefined()
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
    expect(hook).toContain('readDailyAllowanceDaysInput')
    expect(hook).toContain('dailyAllowanceDays')
  })

  /**
   * ⚠️ `type="number"` **come** o que não é número: em vários navegadores `2,5` chega ao `onChange`
   * como string vazia, e a recusa que a tela deveria mostrar nunca teria como acontecer.
   */
  test('the day field is a text field that renders the suggestion, not a browser number field', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    const labelStart = dialog.indexOf("creation.dailyAllowanceDays'")
    expect(labelStart).toBeGreaterThan(-1)
    const field = dialog.slice(labelStart, dialog.indexOf('</label>', labelStart))

    expect(field).toContain('inputMode="numeric"')
    expect(field).toContain('displayDailyAllowanceDays(')
    expect(field).not.toContain('type="number"')
    expect(field).not.toContain('min={1}')
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
