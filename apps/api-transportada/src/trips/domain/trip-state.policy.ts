/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'

/**
 * ADR-0043 §1: dois eixos. A nota anda por conta própria (`pending → separated → loaded →
 * delivered | returned`) e o estado da viagem é **derivado** disso, exceto nas quatro transições
 * manuais. Módulo puro, sem I/O — é o que torna testável toda aresta inválida sem subir banco.
 */

export const TRIP_DOCUMENT_ACTION = {
  deliver: 'deliver',
  load: 'load',
  return: 'return',
  separate: 'separate',
} as const

export type TripDocumentAction = (typeof TRIP_DOCUMENT_ACTION)[keyof typeof TRIP_DOCUMENT_ACTION]

export const TRIP_ACTION = {
  cancel: 'cancel',
  dispatch: 'dispatch',
  planRoute: 'planRoute',
} as const

export type TripAction = (typeof TRIP_ACTION)[keyof typeof TRIP_ACTION]

export const TRIP_TRANSITION_BLOCK = {
  /** A carga já está na rua: nenhuma nota entra, sai ou muda de separação (ADR-0043 §2). */
  tripAlreadyDispatched: 'TRIP_ALREADY_DISPATCHED',
  tripCancelled: 'TRIP_CANCELLED',
  tripCompleted: 'TRIP_COMPLETED',
  /** Entregar e devolver acontecem na rua — antes do despacho a nota ainda está no barracão. */
  tripNotDispatched: 'TRIP_NOT_DISPATCHED',
  /** Separar carga cujo roteiro ninguém conferiu é separar carga que talvez não vá. */
  tripRouteNotPlanned: 'TRIP_ROUTE_NOT_PLANNED',
  /** Não existe despacho sem roteiro montado. */
  tripHasNoRoute: 'TRIP_HAS_NO_ROUTE',
  documentNotSeparated: 'TRIP_DOCUMENT_NOT_SEPARATED',
  documentNotLoaded: 'TRIP_DOCUMENT_NOT_LOADED',
  documentAlreadyClosed: 'TRIP_DOCUMENT_ALREADY_CLOSED',
} as const

export type TripTransitionBlock = (typeof TRIP_TRANSITION_BLOCK)[keyof typeof TRIP_TRANSITION_BLOCK]

/**
 * Três desfechos, não dois. `unchanged` é o que sustenta a idempotência da RF-8: a rede do armazém
 * cai e o separador toca duas vezes — repetir a mesma transição devolve 200 sem gravar evento novo,
 * nunca 409.
 */
export type TripTransition<TStatus> =
  | { readonly outcome: 'applied'; readonly nextStatus: TStatus }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'blocked'; readonly reason: TripTransitionBlock }

/** A ordem em que a viagem anda. `cancelled` fica fora: é saída, não etapa. */
const TRIP_STATUS_ORDER = [
  'draft',
  'route_planned',
  'separating',
  'loading',
  'dispatched',
  'in_transit',
  'completed',
] as const

const DOCUMENT_TARGET_STATUS: Readonly<Record<TripDocumentAction, TripDocumentSeparationStatus>> = {
  deliver: 'delivered',
  load: 'loaded',
  return: 'returned',
  separate: 'separated',
}

export function tripStatusRank(status: TripStatus): number {
  const rank = TRIP_STATUS_ORDER.indexOf(status as (typeof TRIP_STATUS_ORDER)[number])
  return rank === -1 ? Number.NaN : rank
}

export function isTripDispatched(status: TripStatus): boolean {
  return status === 'dispatched' || status === 'in_transit' || status === 'completed'
}

/**
 * ADR-0043 §2: vincular e desvincular nota são trabalho de barracão, como separar e carregar —
 * `dispatched` em diante é a porta de não-retorno para os dois também. `null` significa liberado.
 */
export function checkTripAcceptsLinkage(tripStatus: TripStatus): TripTransitionBlock | null {
  if (tripStatus === 'cancelled') return TRIP_TRANSITION_BLOCK.tripCancelled
  if (tripStatus === 'completed') return TRIP_TRANSITION_BLOCK.tripCompleted
  if (isTripDispatched(tripStatus)) return TRIP_TRANSITION_BLOCK.tripAlreadyDispatched

  return null
}

/** Entregue e devolvida são terminais: a nota saiu do fluxo de separação para sempre. */
export function isTripDocumentClosed(status: TripDocumentSeparationStatus): boolean {
  return status === 'delivered' || status === 'returned'
}

export type CheckTripDocumentTransitionParams = {
  readonly action: TripDocumentAction
  readonly documentStatus: TripDocumentSeparationStatus
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1 e §2. Toda aresta do eixo da nota passa por aqui, inclusive as proibidas — e o
 * estado da viagem participa da decisão porque separar e carregar são de barracão, entregar e
 * devolver são de rua.
 */
export function checkTripDocumentTransition({
  action,
  documentStatus,
  tripStatus,
}: CheckTripDocumentTransitionParams): TripTransition<TripDocumentSeparationStatus> {
  const target = DOCUMENT_TARGET_STATUS[action]

  // A ordem destes quatro portões é decisão, não acaso.
  //
  // 1. **O no-op idempotente vem antes de tudo**, inclusive do estado da viagem. "A nota já está
  //    onde você quer" é verdade independente da viagem, nunca escreve nada, e é o que torna todo
  //    replay seguro. A fila offline do motorista (spec 057 D5) drena confirmação duplicada muito
  //    depois do toque: se o portão da viagem viesse primeiro, uma entrega que **funcionou**
  //    voltaria como 409 e o PWA mostraria conflito para o motorista que fez tudo certo.
  // 2. Depois o estado da viagem, que é a restrição externa — carga que já saiu não se separa,
  //    seja qual for o estado da nota.
  // 3. Depois o terminal da nota (entregue/devolvida não voltam ao fluxo de separação).
  // 4. Por último a origem exigida pela ação.
  if (documentStatus === target) return { outcome: 'unchanged' }

  const tripBlock = checkTripAcceptsDocumentWork({ action, tripStatus })
  if (tripBlock !== null) return { outcome: 'blocked', reason: tripBlock }

  if (isTripDocumentClosed(documentStatus)) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentAlreadyClosed }
  }

  return checkDocumentOrigin({ action, documentStatus, target })
}

function checkTripAcceptsDocumentWork(input: {
  readonly action: TripDocumentAction
  readonly tripStatus: TripStatus
}): TripTransitionBlock | null {
  const { action, tripStatus } = input
  if (tripStatus === 'cancelled') return TRIP_TRANSITION_BLOCK.tripCancelled
  if (tripStatus === 'completed') return TRIP_TRANSITION_BLOCK.tripCompleted

  const isStreetWork =
    action === TRIP_DOCUMENT_ACTION.deliver || action === TRIP_DOCUMENT_ACTION.return
  if (isStreetWork) {
    return isTripDispatched(tripStatus) ? null : TRIP_TRANSITION_BLOCK.tripNotDispatched
  }

  if (isTripDispatched(tripStatus)) return TRIP_TRANSITION_BLOCK.tripAlreadyDispatched
  if (tripStatus === 'draft') return TRIP_TRANSITION_BLOCK.tripRouteNotPlanned

  return null
}

function checkDocumentOrigin(input: {
  readonly action: TripDocumentAction
  readonly documentStatus: TripDocumentSeparationStatus
  readonly target: TripDocumentSeparationStatus
}): TripTransition<TripDocumentSeparationStatus> {
  const { action, documentStatus, target } = input

  if (action === TRIP_DOCUMENT_ACTION.separate) {
    return { outcome: 'applied', nextStatus: target }
  }

  if (action === TRIP_DOCUMENT_ACTION.load) {
    return documentStatus === 'separated'
      ? { outcome: 'applied', nextStatus: target }
      : { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotSeparated }
  }

  return documentStatus === 'loaded'
    ? { outcome: 'applied', nextStatus: target }
    : { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotLoaded }
}

export type CheckTripTransitionParams = {
  readonly action: TripAction
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}

/**
 * As transições manuais da viagem (ADR-0043 §1). As demais são derivadas — ver
 * `deriveTripStatus`, e nunca escritas à mão.
 */
export function checkTripTransition({
  action,
  hasRoute,
  tripStatus,
}: CheckTripTransitionParams): TripTransition<TripStatus> {
  if (action === TRIP_ACTION.cancel) return checkCancel(tripStatus)
  if (action === TRIP_ACTION.planRoute) return checkPlanRoute({ hasRoute, tripStatus })

  return checkDispatch({ hasRoute, tripStatus })
}

/**
 * ADR-0043 §2: sair de `dispatched` só por cancelamento administrativo — é incidente, não fluxo,
 * e a rota exige motivo. Concluída não cancela: o que aconteceu já aconteceu.
 */
function checkCancel(tripStatus: TripStatus): TripTransition<TripStatus> {
  if (tripStatus === 'cancelled') return { outcome: 'unchanged' }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }

  return { outcome: 'applied', nextStatus: 'cancelled' }
}

function checkPlanRoute(input: {
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}): TripTransition<TripStatus> {
  const { hasRoute, tripStatus } = input
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (isTripDispatched(tripStatus)) {
    return {
      outcome: 'blocked',
      reason:
        tripStatus === 'completed'
          ? TRIP_TRANSITION_BLOCK.tripCompleted
          : TRIP_TRANSITION_BLOCK.tripAlreadyDispatched,
    }
  }
  if (!hasRoute) return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute }
  // Separação em andamento não regride para `route_planned`: reordenar parada é outra operação,
  // e ela continua liberada até o despacho.
  if (tripStatus !== 'draft') return { outcome: 'unchanged' }

  return { outcome: 'applied', nextStatus: 'route_planned' }
}

function checkDispatch(input: {
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}): TripTransition<TripStatus> {
  const { hasRoute, tripStatus } = input
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }
  if (isTripDispatched(tripStatus)) return { outcome: 'unchanged' }
  if (tripStatus === 'draft' || !hasRoute) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute }
  }

  return { outcome: 'applied', nextStatus: 'dispatched' }
}

export type TripDocumentTally = {
  readonly delivered: number
  readonly loaded: number
  readonly pending: number
  readonly returned: number
  readonly separated: number
}

export function tallyTripDocuments(
  statuses: readonly TripDocumentSeparationStatus[],
): TripDocumentTally {
  return {
    delivered: statuses.filter((status) => status === 'delivered').length,
    loaded: statuses.filter((status) => status === 'loaded').length,
    pending: statuses.filter((status) => status === 'pending').length,
    returned: statuses.filter((status) => status === 'returned').length,
    separated: statuses.filter((status) => status === 'separated').length,
  }
}

export type DeriveTripStatusParams = {
  readonly tally: TripDocumentTally
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1: o estado da viagem é consequência aritmética do estado das notas, calculada na
 * mesma transação da escrita da nota. **Só anda para a frente** — nenhuma derivação faz a viagem
 * regredir, e é isso que impede um painel de discordar do outro.
 */
export function deriveTripStatus({ tally, tripStatus }: DeriveTripStatusParams): TripStatus {
  if (tripStatus === 'cancelled' || tripStatus === 'completed') return tripStatus

  const total = tally.pending + tally.separated + tally.loaded + tally.delivered + tally.returned
  // Viagem sem nota não deriva nada — "toda nota entregue" é vacuamente verdade num saco vazio.
  if (total === 0) return tripStatus

  const candidate = resolveDerivedCandidate({ tally, total, tripStatus })

  return tripStatusRank(candidate) > tripStatusRank(tripStatus) ? candidate : tripStatus
}

function resolveDerivedCandidate(input: {
  readonly tally: TripDocumentTally
  readonly total: number
  readonly tripStatus: TripStatus
}): TripStatus {
  const { tally, total, tripStatus } = input
  const closed = tally.delivered + tally.returned

  if (isTripDispatched(tripStatus)) {
    if (closed === total) return 'completed'
    if (closed > 0) return 'in_transit'

    return tripStatus
  }

  if (tally.loaded > 0) return 'loading'
  if (tally.separated > 0) return 'separating'

  return tripStatus
}
