/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import type { UpsertCargoLayoutRequestResult } from './cargo-layout-request.types.js'

export type RequestCargoLayoutParams = BuildCargoLayoutInputParams & {
  readonly companyId: string
  readonly correlationId: string
  readonly tripId: string | null
}

/** Spec 145 D15/D10: sem capacidade ou sem baú nada é enfileirado — T10/T11 leem `unavailable`. */
export type CargoLayoutUnavailableResult = {
  readonly enqueued: false
  readonly layoutId: null
  readonly status: 'unavailable'
}

export type RequestCargoLayoutResult = UpsertCargoLayoutRequestResult | CargoLayoutUnavailableResult

export type RequestCargoLayoutUseCase = {
  execute(params: RequestCargoLayoutParams): Promise<RequestCargoLayoutResult>
}
