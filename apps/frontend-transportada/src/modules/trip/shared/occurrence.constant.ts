/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/shared/trip-occurrence.constant.ts` — o bundle não
 * carrega código da API, o mesmo caso de `FUEL_TYPES` e `VEHICLE_TYPES`. A lista, a ordem e o grupo
 * de cada tipo fazem parte do contrato; mudou de um lado, mude do outro.
 *
 * Quem guarda a paridade são `api-transportada/test/trip-occurrence/catalog.contract.ts` e
 * `test/trip/occurrence-catalog.contract.ts`.
 */

export const TRIP_OCCURRENCE_STAGE = {
  delivery: 'delivery',
  separation: 'separation',
} as const

export type TripOccurrenceStage = (typeof TRIP_OCCURRENCE_STAGE)[keyof typeof TRIP_OCCURRENCE_STAGE]

/** A ordem é a do fluxo — o galpão antes da rua — e é nela que a tela lista. */
export const TRIP_OCCURRENCE_TYPES = [
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_faltante' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_avariado' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'divergencia_quantidade' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_total' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_parcial' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'avaria_transporte' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'destinatario_ausente' },
] as const

export type TripOccurrenceType = (typeof TRIP_OCCURRENCE_TYPES)[number]['type']

/**
 * Só os tipos que a tela do escritório oferece. A ocorrência de rua é `trip.report` e mora na
 * árvore do motorista — oferecê-la aqui produziria um botão que sempre responde 403.
 */
export function separationOccurrenceTypes(): readonly TripOccurrenceType[] {
  return TRIP_OCCURRENCE_TYPES.filter(
    (entry) => entry.stage === TRIP_OCCURRENCE_STAGE.separation,
  ).map((entry) => entry.type)
}

/** Spec 079: uma linha por tipo do catálogo — os sete, sempre, mesmo os que ninguém ligou. */
export type OccurrenceNotificationEntry = Readonly<{
  notifies: boolean
  stage: TripOccurrenceStage
  type: TripOccurrenceType
}>
