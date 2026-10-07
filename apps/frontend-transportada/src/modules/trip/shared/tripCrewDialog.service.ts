/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ChangeTripCrewInput } from './trip.types'

/**
 * Spec 217 (RF4/RF6): `PATCH /trips/:id/crew` substitui a tripulação/veículo inteiros — o corpo é
 * sempre os dois campos, na ordem escolhida na tela (a ordem decide `position`, spec 217 D1).
 */
export function buildChangeTripCrewInput(input: {
  readonly driverIds: readonly string[]
  /** Spec 149: a lista inteira — o que não vem nela sai da viagem, então a vazia também é enviada. */
  readonly helperIds: readonly string[]
  readonly tripId: string
  readonly vehicleId: string
}): ChangeTripCrewInput {
  return {
    driverIds: input.driverIds,
    helperIds: input.helperIds,
    tripId: input.tripId,
    ...(input.vehicleId === '' ? {} : { vehicleId: input.vehicleId }),
  }
}

export const CREW_DIALOG_ERROR_KEYS = [
  'separationStarted',
  'helperWithoutDriver',
  'helperNotEligible',
  'driverCannotDrive',
  'generic',
] as const
export type CrewDialogErrorKey = (typeof CREW_DIALOG_ERROR_KEYS)[number]

const CREW_DIALOG_ERROR_KEY_BY_CODE: Readonly<Record<string, CrewDialogErrorKey>> = {
  STATE_TRANSITION_NOT_ALLOWED: 'separationStarted',
  /** Spec 149 D5/D11: a posição 1 é sempre motorista, e só a ficha marcada pode ajudar. */
  TRIP_CREW_HELPER_NOT_ELIGIBLE: 'helperNotEligible',
  TRIP_CREW_HELPER_WITHOUT_DRIVER: 'helperWithoutDriver',
  /**
   * Spec 235 D5: a ficha escolhida como motorista não dirige (409). Não é o `TRIP_CREW_HELPER_CANNOT_DRIVE`
   * (403) do ajudante que tenta despachar: aquele não nasce na troca de tripulação e cai no genérico.
   */
  TRIP_DRIVER_CANNOT_DRIVE: 'driverCannotDrive',
}

/**
 * Spec 217 RF4/D2: a única recusa de transição que esta ação pode ver é a separação já iniciada
 * (`STATE_TRANSITION_NOT_ALLOWED`, `TRIP_SEPARATION_STARTED`). A regra da casa é filtrar pelo
 * `code` do erro — que `tripClient.service.ts` carrega em `error.message` — nunca pelo texto em
 * inglês de `details[].message`.
 */
export function resolveCrewDialogErrorKey(error: unknown): CrewDialogErrorKey {
  if (!(error instanceof Error)) return 'generic'
  return CREW_DIALOG_ERROR_KEY_BY_CODE[error.message] ?? 'generic'
}
