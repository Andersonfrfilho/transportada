/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3 (D4, D7, RF4): o escritório encaixa a coleta de canhoto na viagem de outro motorista, numa parada no
 * endereço da entrega de origem, e a tira de lá. A empresa vem sempre do contexto, nunca do corpo.
 */
import type { CanhotoPickupStatus } from '../../shared/canhoto-pickup.constant.js'

export type CanhotoPickupView = {
  readonly createdAt: string
  readonly documentNumber: null | string
  readonly id: string
  readonly nfeDocumentId: null | string
  readonly occurrenceId: string
  readonly originStopLabel: null | string
  readonly originTripDocumentId: string
  readonly originTripId: string
  readonly pickupStopId: null | string
  readonly pickupTripId: null | string
  readonly status: CanhotoPickupStatus
}

export type CanhotoPickupWriteActor = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
}

export type CanhotoPickupWriteResult = {
  readonly pickup: CanhotoPickupView
  /**
   * Viagens antes do despacho cujo conjunto de paradas mudou: a rota planejada já morreu na transação
   * (`clearPlannedRoute`) e o caso de uso a recongela depois do commit, best-effort (spec 153 T704).
   */
  readonly tripsToRefreeze: readonly string[]
}

export type CanhotoPickupSchedulePort = {
  list(params: {
    readonly companyId: string
    readonly limit: number
    readonly statuses: readonly CanhotoPickupStatus[]
    readonly tripId?: string
  }): Promise<readonly CanhotoPickupView[]>
  schedule(
    params: CanhotoPickupWriteActor & { readonly pickupId: string; readonly tripId: string },
  ): Promise<CanhotoPickupWriteResult>
  unschedule(
    params: CanhotoPickupWriteActor & { readonly pickupId: string },
  ): Promise<CanhotoPickupWriteResult>
}
