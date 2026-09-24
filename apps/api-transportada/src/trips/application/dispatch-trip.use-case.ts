/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { ResolveDispatchReadinessResult } from '../domain/dispatch-readiness.policy.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import {
  TripDispatchForceReasonRequiredError,
  TripDispatchLoadRemainingWithForceError,
  TripHasUnloadedDocumentsError,
  TripHasUnscheduledStopsError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'

export type DispatchTripPreconditions = {
  readonly hasRoute: boolean
  /** Spec 185 (D1): a conta pura de `resolveDispatchReadiness` sobre as notas da viagem. */
  readonly isCargoClosed: ResolveDispatchReadinessResult['isCargoClosed']
  readonly leftBehind: ResolveDispatchReadinessResult['leftBehind']
  readonly toLoad: ResolveDispatchReadinessResult['toLoad']
  readonly tripStatus: TripStatus
  /**
   * Ids de nota viva (não devolvida, não liberada) que nunca chegaram a `loaded` — os de `toLoad`.
   * Spec 185: a nota que a ocorrência deixa para trás (`leftBehind`) não conta aqui.
   */
  readonly unloadedDocumentIds: readonly string[]
  /**
   * Spec 060 D3: paradas de cliente que exige agendamento e ainda não têm um que valha. Sair sem
   * ele é a viagem perdida que esta spec existe para evitar — o cliente recusa a carga na portaria.
   */
  readonly unscheduledStopIds: readonly string[]
}

export type DispatchTripWriteInput = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  /**
   * Spec 185 (RF4): as notas que `loadRemaining` separa e carrega **na transação do despacho**,
   * com o status lido na precondição — a escrita confere de novo, linha a linha.
   */
  readonly documentsToLoad: DispatchTripPreconditions['toLoad'] /** `true` só quando havia pendência real — despachar sem pendência nunca é "forçado". */
  readonly forced: boolean
  readonly forceReason: string | null
  /**
   * Spec 158 T13: o que a transação reconfere sob o lock é o **status**. Este `hasRoute` é o valor
   * da decisão do caso de uso, ainda lido fora dela — roteiro apagado na janela fica fora do
   * escopo da T13, e o eixo protegido é `trips.status`.
   */
  readonly hasRoute: boolean
  /** Spec 185 (RF5): liberadas sempre, sem `force`, com o motivo "Ocorrência: <tipo>". */
  readonly leftBehind: DispatchTripPreconditions['leftBehind']
  readonly onBehalfOfDriverId: string | null
  readonly tripId: string
  /** As não carregadas que o `force` libera — vazio sem `force`. */
  readonly unloadedDocumentIds: readonly string[]
}

export type DispatchTripWriteResult = {
  readonly tripStatus: TripStatus
}

export type DispatchTripPort = {
  dispatch(input: DispatchTripWriteInput): Promise<DispatchTripWriteResult>
  readPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<DispatchTripPreconditions | null>
}

export type DispatchTripInput = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly force?: boolean
  readonly forceReason?: string | null
  /** Spec 185 (RF4, ADR-0074 §3): o botão "Despachar" leva todas — separa e carrega o que falta. */
  readonly loadRemaining?: boolean
  readonly onBehalfOfDriverId?: string | null
  readonly repository: DispatchTripPort
  readonly tripId: string
}

export type DispatchTripResult = {
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §2: `dispatched` é a porta de não-retorno. Nota pendente ou separada (nunca carregada)
 * recusa por padrão — `force` mais motivo obrigatório desvincula essas notas de volta ao pool
 * (spec 056 P2), e `loadRemaining` as separa e carrega na mesma transação (spec 185 RF4). A nota
 * que a ocorrência deixa para trás sai sempre, sem `force` (spec 185 RF5). Idempotente:
 * despachar uma viagem já despachada não repete o congelamento nem pede motivo de novo.
 */
export async function dispatchTrip(input: DispatchTripInput): Promise<DispatchTripResult> {
  const isForce = input.force ?? false
  const isLoadRemaining = input.loadRemaining ?? false
  if (isForce && isLoadRemaining) throw new TripDispatchLoadRemainingWithForceError()

  const state = await input.repository.readPreconditions(input)
  if (state === null) throw new TripNotFoundError()

  const transition = checkTripTransition({
    action: TRIP_ACTION.dispatch,
    hasRoute: state.hasRoute,
    tripStatus: state.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') return { tripStatus: state.tripStatus }

  const forced = assertDispatchGates({ isForce, isLoadRemaining, state })
  if (forced && (input.forceReason ?? '').trim().length === 0) {
    throw new TripDispatchForceReasonRequiredError()
  }

  const written = await input.repository.dispatch({
    actorUserId: input.actorUserId,
    channel: input.channel,
    companyId: input.companyId,
    documentsToLoad: isLoadRemaining ? state.toLoad : [],
    forced,
    forceReason: forced ? (input.forceReason ?? null) : null,
    hasRoute: state.hasRoute,
    leftBehind: state.leftBehind,
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    tripId: input.tripId,
    unloadedDocumentIds: isForce ? state.unloadedDocumentIds : [],
  })

  return { tripStatus: written.tripStatus }
}

/**
 * Duas pendências, um `force`: nota não carregada e parada sem agendamento. A recusa nomeia
 * **qual** delas travou — "a viagem não pode sair" sem dizer o quê manda o operador procurar.
 * A do agendamento vem primeiro porque ela não se resolve no barracão: depende do cliente, e
 * `loadRemaining` não a fura (spec 185 RF4). Devolve se o despacho é forçado.
 */
function assertDispatchGates(input: {
  readonly isForce: boolean
  readonly isLoadRemaining: boolean
  readonly state: DispatchTripPreconditions
}): boolean {
  const { isForce, isLoadRemaining, state } = input
  /**
   * Spec 185 ("casos extremos"): liberar as deixadas para trás sem sobrar nota carregada seria
   * despachar viagem vazia. Sem `force`, recusa com as notas que ficariam, pelo mesmo 409 de nota
   * não carregada; com `force`, é despacho forçado e assinado — como era antes da spec 185, quando
   * essas notas ainda contavam como não carregadas.
   */
  const willCarryCargo = state.isCargoClosed || (isLoadRemaining && state.toLoad.length > 0)
  const leavesTripEmpty = state.leftBehind.length > 0 && !willCarryCargo
  const hasPendency = state.unloadedDocumentIds.length > 0 || state.unscheduledStopIds.length > 0
  if (isForce) return hasPendency || leavesTripEmpty

  if (state.unscheduledStopIds.length > 0) {
    throw new TripHasUnscheduledStopsError(state.unscheduledStopIds)
  }
  if (state.unloadedDocumentIds.length > 0 && !isLoadRemaining) {
    throw new TripHasUnloadedDocumentsError(state.unloadedDocumentIds)
  }
  if (leavesTripEmpty) {
    throw new TripHasUnloadedDocumentsError(
      state.leftBehind.map((document) => document.tripDocumentId),
    )
  }

  return false
}
