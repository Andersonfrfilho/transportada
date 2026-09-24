/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 D10: as ações que a tela oferece saem daqui, e não de uma regra reescrita no cliente.
 * Uma ação entra quando a máquina de estados a **aplicaria agora** (`applied`, nunca `unchanged`)
 * e quem pergunta tem a permissão da rota que a executa. Pré-condição de negócio com erro próprio
 * (agendamento, foto obrigatória, CT-e) fica na rota: a lista promete o que a máquina aceita, não
 * que o toque passe.
 *
 * Nenhuma tabela nova: tudo compõe `trip-state.policy.ts` e, para a ocorrência do galpão,
 * `operator-trip-actions.policy.ts`.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import { OPERATOR_TRIP_ACTION, resolveOperatorTripActions } from './operator-trip-actions.policy.js'
import {
  TRIP_ACTION,
  TRIP_DOCUMENT_ACTION,
  TRIP_ON_ROAD_STATUSES,
  checkTripDocumentTransition,
  checkTripTransition,
  isTripDispatched,
  type TripAction,
  type TripDocumentAction,
} from './trip-state.policy.js'

export const STOP_ALLOWED_ACTION = { arrive: 'arrive', occurrence: 'occurrence' } as const

export type StopAllowedAction = (typeof STOP_ALLOWED_ACTION)[keyof typeof STOP_ALLOWED_ACTION]

/**
 * ⚠️ `deliver`/`return` do caminho do barracão (`trip.manage`) **não** entram (ressalva A1): a
 * baixa de rua pela tela é a do escritório em nome do motorista, e o separador não reporta entrega.
 */
export const DOCUMENT_ALLOWED_ACTION = {
  fieldDelivery: 'fieldDelivery',
  fieldOccurrence: 'fieldOccurrence',
  fieldProof: 'fieldProof',
  fieldReturn: 'fieldReturn',
  load: TRIP_DOCUMENT_ACTION.load,
  occurrence: 'occurrence',
  separate: TRIP_DOCUMENT_ACTION.separate,
} as const

export type DocumentAllowedAction =
  (typeof DOCUMENT_ALLOWED_ACTION)[keyof typeof DOCUMENT_ALLOWED_ACTION]

export type TripActionCapabilities = {
  /** `trip.manage`: o barracão (separar, carregar, roteiro, despacho, cancelamento). */
  readonly canManage: boolean
  /** `trip.report-on-behalf`: a baixa do escritório em nome do motorista (ADR-0067). */
  readonly canReportOnBehalf: boolean
}

export type AllowedActionsDocument = {
  readonly id: string
  readonly releasedAt: string | null
  readonly separationStatus: TripDocumentSeparationStatus
  readonly stopId: string | null
}

export type AllowedActionsStop = {
  readonly arrivedAt: string | null
  readonly id: string
}

export type AllowedActionsTripSnapshot = {
  readonly documents: readonly AllowedActionsDocument[]
  /** Viagem sem motorista não aceita baixa pelo escritório (`TRIP_WITHOUT_DRIVER`, T3). */
  readonly hasDriver: boolean
  readonly status: TripStatus
  /** Todas as paradas da viagem — é a contagem que o SQL do roteiro também usa. */
  readonly stops: readonly AllowedActionsStop[]
}

export type ResolveTripAllowedActionsParams = {
  readonly capabilities: TripActionCapabilities
  readonly trip: AllowedActionsTripSnapshot
}

export type ResolveTripAllowedActionsResult = {
  readonly documents: Readonly<Record<string, readonly DocumentAllowedAction[]>>
  readonly stops: Readonly<Record<string, readonly StopAllowedAction[]>>
  readonly trip: readonly TripAction[]
}

export type ResolveTripHasRouteParams = {
  readonly documents: readonly AllowedActionsDocument[]
  readonly stopCount: number
}

const NOT_LOADED_STATUSES: readonly TripDocumentSeparationStatus[] = ['pending', 'separated']

/**
 * ⚠️ **Cópia do SQL de `readRouteState`** (`drizzle-trip-route.repository.ts`), e um contrato de
 * integração compara as duas: existe parada, e nenhuma nota viva está sem parada — nota liberada e
 * nota devolvida sem parada não contam (ressalva A2).
 */
export function resolveTripHasRoute({ documents, stopCount }: ResolveTripHasRouteParams): boolean {
  if (stopCount === 0) return false
  return !documents.some(
    (document) =>
      document.releasedAt === null &&
      document.stopId === null &&
      document.separationStatus !== 'returned',
  )
}

export function resolveTripAllowedActions({
  capabilities,
  trip,
}: ResolveTripAllowedActionsParams): ResolveTripAllowedActionsResult {
  const hasRoute = resolveTripHasRoute({ documents: trip.documents, stopCount: trip.stops.length })
  return {
    documents: collectByIdentifier(
      trip.documents.map((document) => ({
        actions: resolveDocumentActions({ capabilities, document, hasRoute, trip }),
        id: document.id,
      })),
    ),
    stops: collectByIdentifier(
      trip.stops.map((stop) => ({
        actions: resolveStopActions({ capabilities, stop, trip }),
        id: stop.id,
      })),
    ),
    trip: resolveTripLevelActions({ capabilities, hasRoute, trip }),
  }
}

function resolveTripLevelActions(input: {
  readonly capabilities: TripActionCapabilities
  readonly hasRoute: boolean
  readonly trip: AllowedActionsTripSnapshot
}): readonly TripAction[] {
  const managed: readonly TripAction[] = input.capabilities.canManage
    ? [TRIP_ACTION.planRoute, TRIP_ACTION.dispatch, TRIP_ACTION.cancel]
    : []
  /** ADR-0074 §5: "Conferir carga" some da lista — o carregamento já é a conferência. */
  const field: readonly TripAction[] = canReportInField(input) ? [TRIP_ACTION.startRoute] : []

  return [...managed, ...field].filter(
    (action) =>
      checkTripTransition({ action, hasRoute: input.hasRoute, tripStatus: input.trip.status })
        .outcome === 'applied',
  )
}

function resolveStopActions(input: {
  readonly capabilities: TripActionCapabilities
  readonly stop: AllowedActionsStop
  readonly trip: AllowedActionsTripSnapshot
}): readonly StopAllowedAction[] {
  if (!canReportInField(input) || !isTripOnRoad(input.trip.status)) return []

  return input.stop.arrivedAt === null
    ? [STOP_ALLOWED_ACTION.arrive, STOP_ALLOWED_ACTION.occurrence]
    : [STOP_ALLOWED_ACTION.occurrence]
}

function resolveDocumentActions(input: {
  readonly capabilities: TripActionCapabilities
  readonly document: AllowedActionsDocument
  readonly hasRoute: boolean
  readonly trip: AllowedActionsTripSnapshot
}): readonly DocumentAllowedAction[] {
  if (input.document.releasedAt !== null) return []

  return [
    ...(input.capabilities.canManage ? resolveWarehouseDocumentActions(input) : []),
    ...(canReportInField(input) ? resolveFieldDocumentActions(input) : []),
  ]
}

function resolveWarehouseDocumentActions(input: {
  readonly document: AllowedActionsDocument
  readonly hasRoute: boolean
  readonly trip: AllowedActionsTripSnapshot
}): readonly DocumentAllowedAction[] {
  const transitions = [DOCUMENT_ALLOWED_ACTION.separate, DOCUMENT_ALLOWED_ACTION.load].filter(
    (action) => isDocumentTransitionApplied({ action, input }),
  )
  /** Ressalva M2: o mesmo portão do menu do operador no WhatsApp, sem cópia. */
  const operatorActions = resolveOperatorTripActions({
    hasPendingDocuments: input.trip.documents.some(
      (document) =>
        document.releasedAt === null && NOT_LOADED_STATUSES.includes(document.separationStatus),
    ),
    hasRoute: input.hasRoute,
    tripStatus: input.trip.status,
  })
  return operatorActions.includes(OPERATOR_TRIP_ACTION.occurrence)
    ? [...transitions, DOCUMENT_ALLOWED_ACTION.occurrence]
    : transitions
}

function resolveFieldDocumentActions(input: {
  readonly document: AllowedActionsDocument
  readonly trip: AllowedActionsTripSnapshot
}): readonly DocumentAllowedAction[] {
  const actions: DocumentAllowedAction[] = []
  if (isDocumentTransitionApplied({ action: TRIP_DOCUMENT_ACTION.deliver, input })) {
    actions.push(DOCUMENT_ALLOWED_ACTION.fieldDelivery)
  }
  if (isDocumentTransitionApplied({ action: TRIP_DOCUMENT_ACTION.return, input })) {
    actions.push(DOCUMENT_ALLOWED_ACTION.fieldReturn)
  }
  if (!isTripDispatched(input.trip.status)) return actions

  if (input.document.separationStatus === 'delivered') {
    actions.push(DOCUMENT_ALLOWED_ACTION.fieldProof)
  }
  actions.push(DOCUMENT_ALLOWED_ACTION.fieldOccurrence)
  return actions
}

function isDocumentTransitionApplied(params: {
  readonly action: TripDocumentAction
  readonly input: {
    readonly document: AllowedActionsDocument
    readonly trip: AllowedActionsTripSnapshot
  }
}): boolean {
  return (
    checkTripDocumentTransition({
      action: params.action,
      documentStatus: params.input.document.separationStatus,
      tripStatus: params.input.trip.status,
    }).outcome === 'applied'
  )
}

function canReportInField(input: {
  readonly capabilities: TripActionCapabilities
  readonly trip: AllowedActionsTripSnapshot
}): boolean {
  return input.capabilities.canReportOnBehalf && input.trip.hasDriver
}

function isTripOnRoad(status: TripStatus): boolean {
  return (TRIP_ON_ROAD_STATUSES as readonly TripStatus[]).includes(status)
}

function collectByIdentifier<TAction>(
  entries: readonly { readonly actions: readonly TAction[]; readonly id: string }[],
): Readonly<Record<string, readonly TAction[]>> {
  return Object.fromEntries(
    entries.filter((entry) => entry.actions.length > 0).map((entry) => [entry.id, entry.actions]),
  )
}
