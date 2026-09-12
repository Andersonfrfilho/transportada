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

export type RequestCargoLayoutResult = UpsertCargoLayoutRequestResult

export type RequestCargoLayoutUseCase = {
  execute(params: RequestCargoLayoutParams): Promise<RequestCargoLayoutResult>
}
