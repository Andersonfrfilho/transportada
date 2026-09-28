/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ChangeTripCrewInput } from './trip.types'

/**
 * Spec 217 (RF4/RF6): `PATCH /trips/:id/crew` substitui a tripulação/veículo inteiros — o corpo é
 * sempre os dois campos, na ordem escolhida na tela (a ordem decide `position`, spec 217 D1).
 */
export function buildChangeTripCrewInput(input: {
  readonly driverIds: readonly string[]
  readonly tripId: string
  readonly vehicleId: string
}): ChangeTripCrewInput {
  return {
    driverIds: input.driverIds,
    tripId: input.tripId,
    ...(input.vehicleId === '' ? {} : { vehicleId: input.vehicleId }),
  }
}

export const CREW_DIALOG_ERROR_KEYS = ['separationStarted', 'generic'] as const
export type CrewDialogErrorKey = (typeof CREW_DIALOG_ERROR_KEYS)[number]

/**
 * Spec 217 RF4/D2: a única recusa de transição que esta ação pode ver é a separação já iniciada
 * (`STATE_TRANSITION_NOT_ALLOWED`, `TRIP_SEPARATION_STARTED`). A regra da casa é filtrar pelo
 * `code` do erro — que `tripClient.service.ts` carrega em `error.message` — nunca pelo texto em
 * inglês de `details[].message`.
 */
export function resolveCrewDialogErrorKey(error: unknown): CrewDialogErrorKey {
  if (error instanceof Error && error.message === 'STATE_TRANSITION_NOT_ALLOWED') {
    return 'separationStarted'
  }
  return 'generic'
}
