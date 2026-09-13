/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN, TRIP_DETAIL, TRIP_ID } from './trip.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.example.test'
const TRIPS_PATH = `${API_URL}/trips`
const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type SetTripTrailerInput = Readonly<{ trailerVehicleId: null | string; tripId: string }>

type TripClientModule = {
  readonly createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => { readonly setTripTrailer: (input: SetTripTrailerInput) => Promise<unknown> }
}

type TripControllerModule = {
  readonly createTripController: (input: {
    readonly client: { readonly setTripTrailer: (input: SetTripTrailerInput) => Promise<unknown> }
    readonly permissions: readonly string[]
  }) => {
    readonly canManageTrips: boolean
    readonly setTripTrailer: (input: SetTripTrailerInput) => Promise<unknown>
  }
}

/**
 * Spec 147 D3/T13: a viagem de cavalo mostra e troca a carreta. `PUT /trips/:id/trailer` segue o
 * mesmo molde de `setTripMdfeRequirement` (T10 já provou isso do lado da API) — este contrato prova
 * o cliente HTTP, o portão de permissão e a fiação das telas por texto de fonte, como o resto do
 * módulo faz para tudo que não é serviço puro.
 */
describe('trip trailer contract', () => {
  test('PUTs the trailer choice and reads null as "detach"', async () => {
    const { createTripClient } = await loadFutureModule<TripClientModule>(
      '../../src/modules/trip/shared/tripClient.service',
    )
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: { ...TRIP_DETAIL, trailer: null } }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    await client.setTripTrailer({ trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
    await client.setTripTrailer({ trailerVehicleId: null, tripId: TRIP_ID })

    const [attachRequest, detachRequest] = requests
    if (attachRequest === undefined || detachRequest === undefined) {
      throw new Error('TRIP_TRAILER_CONTRACT_REQUEST_MISSING')
    }

    expect(attachRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}/trailer`)
    expect(attachRequest.method).toBe('PUT')
    expect(attachRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(await attachRequest.json()).toEqual({ trailerVehicleId: TRAILER_ID })

    expect(detachRequest.method).toBe('PUT')
    expect(await detachRequest.json()).toEqual({ trailerVehicleId: null })
  })

  test('is a trip.manage mutation, like every other trip write', async () => {
    const { createTripController } = await loadFutureModule<TripControllerModule>(
      '../../src/modules/trip/hooks/useTripWorkspace.hook',
    )
    let calls = 0
    const client = {
      setTripTrailer: () => {
        calls += 1
        return Promise.resolve(TRIP_DETAIL)
      },
    }

    const readOnlyController = createTripController({ client, permissions: ['fleet.read'] })
    expect(readOnlyController.canManageTrips).toBe(false)
    expect(
      await readOnlyController
        .setTripTrailer({ trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'TRIP_FORBIDDEN' }))
    expect(calls).toBe(0)

    const manageController = createTripController({
      client,
      permissions: ['fleet.read', 'trip.manage'],
    })
    await manageController.setTripTrailer({ trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
    expect(calls).toBe(1)
  })

  /** A mutação entra no mesmo hook de sempre (sem pasta `mutations/`) e invalida a viagem. */
  test('the mutation lives in useTripWorkspace and invalidates the trip', async () => {
    const hook = await readApplicationFile('src/modules/trip/hooks/useTripWorkspace.hook.ts')

    expect(hook).toContain('setTrailerMutation')
    expect(hook).toContain('mutationFn: controller.setTripTrailer')
    expect(hook).toContain('onSuccess: invalidate')
  })

  /** Só o cavalo tem carreta, e o select segue travado depois do despacho — mesmo portão de vínculo. */
  test('the trip detail only offers the trailer select for a tractor unit, gated by isTripEditable', async () => {
    const component = await readApplicationFile(
      'src/modules/trip/components/TripDetail.component.tsx',
    )

    expect(component).toContain('=== TRACTOR_UNIT_VEHICLE_TYPE')
    expect(component).toContain('isTractorUnit ?')
    expect(component).toContain('disabled={!canManage || !isEditable}')
    expect(component).toContain('handleSetTrailer')
  })

  /**
   * Espelha o 409 `TRIP_TRAILER_REQUIRED`: o aviso aparece antes do clique, não depois do 409.
   * O botão de despacho mora em `TripHeaderActions` (spec 170) — não em `TripStateActions`, que
   * só cuida das ações sobre o maço selecionado.
   */
  test('the dispatch button warns and disables before asking, mirroring TRIP_TRAILER_REQUIRED', async () => {
    const detail = await readApplicationFile('src/modules/trip/components/TripDetail.component.tsx')
    const headerActions = await readApplicationFile(
      'src/modules/trip/components/TripHeaderActions.component.tsx',
    )

    expect(detail).toContain('requiresTrailer={isTractorUnit && (trip.trailer ?? null) === null}')
    expect(headerActions).toContain('disabled={isDispatchPending || requiresTrailer}')
    expect(headerActions).toContain("t('stateActions.trailerRequired')")
  })

  /** A criação não escolhe a carreta — só informa a padrão que a API vai copiar sozinha (T10). */
  test('the quick-create dialog only informs the default trailer, never lets it be picked', async () => {
    const dialog = await readApplicationFile(
      'src/modules/trip/components/TripQuickCreateDialog.component.tsx',
    )

    expect(dialog).toContain('defaultTrailer')
    expect(dialog).toContain("t('creation.trailerDefault'")
    expect(dialog).toContain("t('creation.trailerDefaultMissing')")
    expect(dialog).not.toContain('setTripTrailer')
  })

  /** Os quatro códigos novos da API viram rótulo pt-BR/en acentuado, como todo erro do módulo. */
  test('maps the four new API error codes to accented labels in both locales', async () => {
    const { TRIP_FEEDBACK_KEY_BY_ERROR } = await loadFutureModule<{
      readonly TRIP_FEEDBACK_KEY_BY_ERROR: Record<string, string>
    }>('../../src/modules/trip/shared/trip.constant')
    const [locale, english] = await Promise.all([
      readApplicationFile('src/modules/trip/locales/trip.locale.json'),
      readApplicationFile('src/modules/trip/locales/trip.en.locale.json'),
    ])

    const codes = [
      'TRIP_TRAILER_REQUIRES_TRACTOR',
      'TRIP_TRAILER_NOT_A_TRAILER',
      'TRIP_TRAILER_IN_USE',
      'TRIP_TRAILER_REQUIRED',
    ]

    for (const code of codes) {
      const key = TRIP_FEEDBACK_KEY_BY_ERROR[code]
      expect(key).toBeString()

      for (const file of [locale, english]) {
        const messages = JSON.parse(file) as { feedback: Record<string, unknown> }
        expect(messages.feedback[key as string]).toBeString()
      }
    }
  })
})
