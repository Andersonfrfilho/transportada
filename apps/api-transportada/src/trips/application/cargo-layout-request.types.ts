/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutStatus } from '../../database/trip-cargo-layout.schema.js'
import type { StoredCargoLayoutInput } from '../domain/cargo-layout-hash.types.js'

export type CargoLayoutRequestParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly input: StoredCargoLayoutInput
  readonly inputHash: string
  readonly policyVersion: string
  readonly tripId: string | null
}

/** Spec 145 D14/D16: `queued`/`running` mais velhos que `leaseMs` são reabertos — o lease do worker. */
export type UpsertCargoLayoutRequestParams = CargoLayoutRequestParams & {
  readonly leaseMs: number
}

/** T11: a pergunta de novo reabre a própria linha — o `companyId` do contexto sempre no filtro. */
export type ReopenStoredCargoLayoutParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly layoutId: string
}

export type ReopenCargoLayoutUseCase = {
  execute(
    params: ReopenStoredCargoLayoutParams,
  ): Promise<UpsertCargoLayoutRequestResult | undefined>
}

export type CargoLayoutLeaseOptions = {
  readonly cargoLayoutLeaseMs: number
}

export type UpsertCargoLayoutRequestResult = {
  readonly enqueued: boolean
  readonly layoutId: string
  readonly status: CargoLayoutStatus
}
