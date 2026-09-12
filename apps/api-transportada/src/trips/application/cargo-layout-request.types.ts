/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutStatus } from '../../database/trip-cargo-layout.schema.js'
import type { StoredCargoLayoutInput } from '../domain/cargo-layout-hash.types.js'

export type UpsertCargoLayoutRequestParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly input: StoredCargoLayoutInput
  readonly inputHash: string
  readonly policyVersion: string
  readonly tripId: string | null
}

export type UpsertCargoLayoutRequestResult = {
  readonly enqueued: boolean
  readonly layoutId: string
  readonly status: CargoLayoutStatus
}
