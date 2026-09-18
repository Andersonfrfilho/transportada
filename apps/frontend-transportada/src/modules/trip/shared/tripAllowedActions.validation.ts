/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys, isEveryItem, isRecord, isString } from './tripGuards.validation'
import { TRIP_ERROR } from './trip.constant'

/**
 * Spec 156 D10: cópia por valor dos nomes que a API publica em `GET /trips/:id/allowed-actions`
 * (`trip-allowed-actions.policy.ts`). A regra não mora aqui — só os nomes que a tela sabe desenhar.
 */
export const TRIP_ALLOWED_ACTIONS = [
  'cancel',
  'confirmLoad',
  'dispatch',
  'planRoute',
  'startRoute',
] as const
export const STOP_ALLOWED_ACTIONS = ['arrive', 'occurrence'] as const
export const DOCUMENT_ALLOWED_ACTIONS = [
  'fieldDelivery',
  'fieldOccurrence',
  'fieldProof',
  'fieldReturn',
  'load',
  'occurrence',
  'separate',
] as const

export type TripAllowedAction = (typeof TRIP_ALLOWED_ACTIONS)[number]
export type StopAllowedAction = (typeof STOP_ALLOWED_ACTIONS)[number]
export type DocumentAllowedAction = (typeof DOCUMENT_ALLOWED_ACTIONS)[number]

export type TripAllowedActions = Readonly<{
  documents: Readonly<Record<string, readonly DocumentAllowedAction[]>>
  stops: Readonly<Record<string, readonly StopAllowedAction[]>>
  trip: readonly TripAllowedAction[]
}>

export type ParseTripAllowedActionsParams = {
  readonly trip: { readonly documentIds: readonly string[]; readonly stopIds: readonly string[] }
  readonly value: unknown
}

const ALLOWED_ACTIONS_KEYS = ['documents', 'stops', 'trip'] as const

/**
 * Ressalva B4: forma estrita e ids só da própria viagem — lista de outra viagem é resposta trocada,
 * e recusá-la é o que impede um botão de agir na nota errada. Nome de ação desconhecido é filtrado,
 * não recusado: ele só pode **esconder** um botão, e a API pode ganhar ação nova sem derrubar a tela.
 */
export function parseTripAllowedActions({
  trip,
  value,
}: ParseTripAllowedActionsParams): TripAllowedActions {
  if (!hasExactKeys(value, ALLOWED_ACTIONS_KEYS) || !isEveryItem(value.trip, isString)) {
    throw invalid()
  }
  return {
    documents: readActionMap({
      known: DOCUMENT_ALLOWED_ACTIONS,
      identifiers: trip.documentIds,
      value: value.documents,
    }),
    stops: readActionMap({
      known: STOP_ALLOWED_ACTIONS,
      identifiers: trip.stopIds,
      value: value.stops,
    }),
    trip: keepKnown({ known: TRIP_ALLOWED_ACTIONS, names: value.trip }),
  }
}

function readActionMap<TAction extends string>(input: {
  readonly identifiers: readonly string[]
  readonly known: readonly TAction[]
  readonly value: unknown
}): Readonly<Record<string, readonly TAction[]>> {
  if (!isRecord(input.value)) throw invalid()
  const identifiers = new Set(input.identifiers)
  const entries = Object.entries(input.value).map(([identifier, names]) => {
    if (!identifiers.has(identifier) || !isEveryItem(names, isString)) throw invalid()
    return [identifier, keepKnown({ known: input.known, names })] as const
  })
  return Object.fromEntries(entries)
}

function keepKnown<TAction extends string>(input: {
  readonly known: readonly TAction[]
  readonly names: readonly string[]
}): readonly TAction[] {
  return input.names.filter((name): name is TAction =>
    (input.known as readonly string[]).includes(name),
  )
}

function invalid(): Error {
  return new Error(TRIP_ERROR.RESPONSE_INVALID)
}
