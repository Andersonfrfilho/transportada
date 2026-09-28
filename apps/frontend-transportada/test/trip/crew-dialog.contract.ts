/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveFieldActionCapabilities } from '@/modules/trip/shared/tripFieldActions.service'
import { parseTripAllowedActions } from '@/modules/trip/shared/tripAllowedActions.validation'
import {
  buildChangeTripCrewInput,
  resolveCrewDialogErrorKey,
} from '@/modules/trip/shared/tripCrewDialog.service'
import type { TripRequestError } from '@/modules/trip/shared/tripClient.service'

const CABECALHO = new URL(
  '../../src/modules/trip/components/TripHeaderActions.component.tsx',
  import.meta.url,
)

function requestError(code: string): TripRequestError {
  return new Error(code) as TripRequestError
}

/**
 * Spec 217 T310: a entrada "Trocar motorista/veículo" só aparece quando `GET
 * /trips/:id/allowed-actions` traz `defineCrew` (D6) — nunca por `if` de status no cliente, ao
 * contrário de "Planejar rota"/"Despachar"/"Cancelar".
 */
describe('visibilidade de "Trocar motorista/veículo" vem de allowed-actions (spec 217 D6)', () => {
  it('parseTripAllowedActions mantém defineCrew como ação conhecida', () => {
    const parsed = parseTripAllowedActions({
      trip: { documentIds: [], stopIds: [] },
      value: { documents: {}, stops: {}, trip: ['defineCrew', 'planRoute'] },
    })
    expect(parsed.trip).toEqual(['defineCrew', 'planRoute'])
  })

  it('a capacidade só libera a ação quando a lista da API a inclui', () => {
    const with_ = resolveFieldActionCapabilities({
      documents: {},
      stops: {},
      trip: ['defineCrew'],
    })
    const without = resolveFieldActionCapabilities({ documents: {}, stops: {}, trip: [] })

    expect(with_.canTrip('defineCrew')).toBe(true)
    expect(without.canTrip('defineCrew')).toBe(false)
  })

  /** Sem resposta nenhuma (falha fechada, spec 156 T8): nenhuma ação aparece, esta incluída. */
  it('sem allowed-actions nenhuma, a capacidade nega — falha fechada', () => {
    expect(resolveFieldActionCapabilities(undefined).canTrip('defineCrew')).toBe(false)
  })

  it('o cabeçalho decide a visibilidade por capabilities.canTrip, não por trip.status', () => {
    const cabecalho = readFileSync(CABECALHO, 'utf8')
    expect(cabecalho).toContain("capabilities.canTrip('defineCrew')")
    expect(cabecalho).toContain('<TripCrewDialog')
  })
})

/** Spec 217 RF4/RF6: o corpo do `PATCH /trips/:id/crew` sai da seleção da tela, na ordem escolhida. */
describe('buildChangeTripCrewInput (spec 217 RF4/RF6)', () => {
  it('manda driverIds na ordem escolhida e o vehicleId', () => {
    expect(
      buildChangeTripCrewInput({
        driverIds: ['driver-2', 'driver-1'],
        tripId: 'trip-1',
        vehicleId: 'vehicle-1',
      }),
    ).toEqual({ driverIds: ['driver-2', 'driver-1'], tripId: 'trip-1', vehicleId: 'vehicle-1' })
  })

  it('vehicleId vazio (nenhum escolhido) sai do corpo, nunca como string vazia', () => {
    const input = buildChangeTripCrewInput({ driverIds: [], tripId: 'trip-1', vehicleId: '' })
    expect(input).toEqual({ driverIds: [], tripId: 'trip-1' })
    expect('vehicleId' in input).toBe(false)
  })
})

/**
 * Spec 217 RF4/D2: a única recusa de transição que esta ação vê é a separação já iniciada. A regra
 * da casa é filtrar pelo `code` do erro — que `tripClient.service.ts` carrega em `error.message` —
 * nunca pelo texto em inglês de `details[].message`.
 */
describe('resolveCrewDialogErrorKey (spec 217 RF4, 409 da separação)', () => {
  it('STATE_TRANSITION_NOT_ALLOWED vira a mensagem de separação já iniciada', () => {
    expect(resolveCrewDialogErrorKey(requestError('STATE_TRANSITION_NOT_ALLOWED'))).toBe(
      'separationStarted',
    )
  })

  it('qualquer outro código vira a mensagem genérica', () => {
    expect(resolveCrewDialogErrorKey(requestError('TRIP_REQUEST_FAILED'))).toBe('generic')
    expect(resolveCrewDialogErrorKey(requestError('FORBIDDEN'))).toBe('generic')
  })

  it('erro que não veio do cliente da viagem também vira genérico', () => {
    expect(resolveCrewDialogErrorKey('não é um Error')).toBe('generic')
    expect(resolveCrewDialogErrorKey(undefined)).toBe('generic')
  })
})
