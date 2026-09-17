/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { StopAddressComponents } from '../domain/stop-address-key.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import {
  TripDocumentNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import {
  freezeTripRouteGracefully,
  type TripRouteFreezeLogger,
} from './freeze-trip-route-gracefully.js'
import type { PlanTripRouteTollFreezer } from './plan-trip-route.use-case.js'

export type DeliveryAddressOverrideRecord = {
  readonly actorUserId: string
  readonly createdAt: string
  readonly id: string
  readonly newAddress: StopAddressComponents
  readonly newLabel: string
  readonly previousAddress: StopAddressComponents
  readonly previousLabel: string
  readonly reason: string
  readonly requestedBy: string
  readonly tripDocumentId: string
}

export type OverrideDeliveryAddressPreconditions = {
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type OverrideDeliveryAddressPort = {
  applyOverride(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly newAddress: StopAddressComponents
    readonly newLabel: string
    readonly reason: string
    readonly requestedBy: string
    readonly tripDocumentId: string
    readonly tripId: string
  }): Promise<DeliveryAddressOverrideRecord>
  readPreconditions(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<OverrideDeliveryAddressPreconditions | null>
}

export type OverrideDeliveryAddressInput = {
  readonly actorUserId: string
  readonly companyId: string
  /** T704 L7: a falha do congelamento vira aviso com os ids, nunca silêncio. */
  readonly logger?: TripRouteFreezeLogger
  readonly newAddress: StopAddressComponents
  readonly newLabel: string
  readonly reason: string
  readonly repository: OverrideDeliveryAddressPort
  readonly requestedBy: string
  /**
   * Spec 153 T704 (M2): sobrescrever endereço move a coordenada da parada — a rota gravada deixa
   * de descrever a viagem. Ausente, comportamento igual a antes desta correção.
   */
  readonly routeFreezer?: PlanTripRouteTollFreezer
  readonly tripDocumentId: string
}

/**
 * ADR-0043 §3 (D9): sobrescrever o endereço de entrega é ação, não edição em linha — nunca
 * `UPDATE` direto. Mesma porta de não-retorno de vincular/desvincular nota e reordenar parada
 * (T013/T014b): a carga já está na rua a partir de `dispatched`, e o roteiro congelado no
 * `trip_stop_snapshot` é o que vale dali em diante.
 */
export async function overrideDeliveryAddress(
  input: OverrideDeliveryAddressInput,
): Promise<DeliveryAddressOverrideRecord> {
  const {
    actorUserId,
    companyId,
    logger,
    newAddress,
    newLabel,
    reason,
    repository,
    requestedBy,
    routeFreezer,
    tripDocumentId,
  } = input
  const preconditions = await repository.readPreconditions({ companyId, tripDocumentId })
  if (preconditions === null) throw new TripDocumentNotFoundError()

  const blockReason = checkTripAcceptsLinkage(preconditions.tripStatus)
  if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)

  const record = await repository.applyOverride({
    actorUserId,
    companyId,
    newAddress,
    newLabel,
    reason,
    requestedBy,
    tripDocumentId,
    tripId: preconditions.tripId,
  })

  /**
   * T704 M2/D6: a transação de `applyOverride` já apagou a rota velha (M1); o recálculo pela mais
   * barata roda depois e nunca derruba a sobrescrita, que é o registro de auditoria da decisão.
   */
  await freezeTripRouteGracefully({
    companyId,
    freezer: routeFreezer,
    ...(logger === undefined ? {} : { logger }),
    tripId: preconditions.tripId,
  })

  return record
}
