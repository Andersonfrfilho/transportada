/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 (D4, ADR-0074 §1/§2): a escrita que fecha a carga — carregar a última nota (linha,
 * lote, WhatsApp) ou registrar a ocorrência que libera a última pendente — tenta despachar a
 * viagem sozinha, com o mesmo ator e canal da escrita, logo depois dela ter comitado.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { ApiError } from '../../shared/api.error.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_TRANSITION_BLOCK } from '../domain/trip-state.policy.js'
import { dispatchTrip, type DispatchTripPort } from './dispatch-trip.use-case.js'
import {
  TripHasUnloadedDocumentsError,
  TripHasUnscheduledStopsError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'

/** Só nesses três estados a escrita de barracão pode fechar a carga e despachar sozinha. */
const AUTO_DISPATCH_ELIGIBLE_STATUSES: readonly TripStatus[] = [
  'route_planned',
  'separating',
  'loading',
]

/** A viagem que já terminou entre as duas leituras: não havia o que despachar. */
const SETTLED_TRIP_BLOCKS: readonly string[] = [
  TRIP_TRANSITION_BLOCK.tripCancelled,
  TRIP_TRANSITION_BLOCK.tripCompleted,
]

const AUTO_DISPATCH_FAILED_LOG_EVENT = 'trip_auto_dispatch_failed'

export type TryAutoDispatchTripBlockedCode =
  | 'TRIP_AUTO_DISPATCH_FAILED'
  | 'TRIP_HAS_NO_ROUTE'
  | 'TRIP_HAS_UNSCHEDULED_STOPS'

export type TryAutoDispatchTripResult =
  | {
      readonly code: TryAutoDispatchTripBlockedCode
      readonly details?: { readonly stopIds: readonly string[] }
      readonly outcome: 'blocked'
    }
  | { readonly outcome: 'dispatched' }

export type AutoDispatchLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
}

/** O que a escrita que pode fechar a carga recebe, por injeção, para tentar o despacho. */
export type AutoDispatchDependencies = {
  readonly logger: AutoDispatchLogger
  readonly repository: DispatchTripPort
}

export type TryAutoDispatchTripInput = AutoDispatchDependencies & {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  /**
   * Spec 185 (revisão, RF2): a escrita que chamou só fecha a carga se pôs **esta** nota em
   * `leftBehind` — sem ela lá, não foi essa escrita que mudou a conta, e não há o que tentar.
   */
  readonly leftBehindDocumentId?: string
  readonly onBehalfOfDriverId?: string | null
  readonly tripId: string
}

/**
 * ADR-0074 §1/§2: nunca `force` — um gate recusado não desfaz a escrita que chamou (ela já
 * comitou antes desta função rodar), a viagem só fica esperando o botão. Fora dos três estados de
 * barracão, ou com carga ainda aberta, não há nada a tentar (`undefined`, RF2/RF3).
 *
 * ⚠️ **Nunca lança.** A escrita que chamou já comitou, e responder erro sobre ela faria o cliente
 * repetir o que deu certo — e, dentro de `withFieldReport`, pularia o `settle` da chave de
 * idempotência. Falha inesperada é fallback gracioso (code-standart §7): log sem PII e
 * `TRIP_AUTO_DISPATCH_FAILED`, para o botão "Despachar" terminar o serviço.
 */
export async function tryAutoDispatchTrip(
  input: TryAutoDispatchTripInput,
): Promise<TryAutoDispatchTripResult | undefined> {
  try {
    return await attemptAutoDispatch(input)
  } catch (error) {
    if (isNothingToDispatch(error)) return undefined
    const blocked = describeBlockedGate(error)
    if (blocked !== null) return blocked

    input.logger.error(AUTO_DISPATCH_FAILED_LOG_EVENT, {
      companyId: input.companyId,
      errorCode: readErrorCode(error),
      tripId: input.tripId,
    })
    return { code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' }
  }
}

async function attemptAutoDispatch(
  input: TryAutoDispatchTripInput,
): Promise<TryAutoDispatchTripResult | undefined> {
  const state = await input.repository.readPreconditions({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  if (state === null) return undefined
  if (!AUTO_DISPATCH_ELIGIBLE_STATUSES.includes(state.tripStatus)) return undefined
  if (!state.isCargoClosed) return undefined
  if (
    input.leftBehindDocumentId !== undefined &&
    !state.leftBehind.some((document) => document.tripDocumentId === input.leftBehindDocumentId)
  ) {
    return undefined
  }

  await dispatchTrip({
    actorUserId: input.actorUserId,
    channel: input.channel,
    companyId: input.companyId,
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    repository: input.repository,
    tripId: input.tripId,
  })
  return { outcome: 'dispatched' }
}

/**
 * Entre a leitura desta função e a transação do despacho, a carga reabriu (nota voltou a faltar)
 * ou a viagem foi cancelada/concluída: não havia o que despachar, e não é falha de ninguém.
 */
function isNothingToDispatch(error: unknown): boolean {
  if (error instanceof TripHasUnloadedDocumentsError) return true
  return (
    error instanceof TripStateTransitionNotAllowedError &&
    SETTLED_TRIP_BLOCKS.includes(error.reason)
  )
}

/** Os dois gates que ADR-0074 §2 descreve como "a viagem fica esperando o botão". */
function describeBlockedGate(error: unknown): TryAutoDispatchTripResult | null {
  if (error instanceof TripHasUnscheduledStopsError) {
    return {
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      details: { stopIds: error.stopIds },
      outcome: 'blocked',
    }
  }
  if (
    error instanceof TripStateTransitionNotAllowedError &&
    error.reason === TRIP_TRANSITION_BLOCK.tripHasNoRoute
  ) {
    return { code: 'TRIP_HAS_NO_ROUTE', outcome: 'blocked' }
  }
  return null
}

/** Só o código — nunca a mensagem do driver, que pode trazer o conteúdo da linha (PII). */
function readErrorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code
  return error instanceof Error ? error.name : 'UnknownError'
}
