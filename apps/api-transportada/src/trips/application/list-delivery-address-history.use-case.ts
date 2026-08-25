/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryAddressOverrideRecord } from './override-delivery-address.use-case.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'

export type ListDeliveryAddressHistoryPort = {
  /** `null` quando o documento não existe nesta empresa/viagem. */
  listHistory(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<readonly DeliveryAddressOverrideRecord[] | null>
}

export type ListDeliveryAddressHistoryInput = {
  readonly companyId: string
  readonly repository: ListDeliveryAddressHistoryPort
  readonly tripDocumentId: string
}

export type ListDeliveryAddressHistoryResult = {
  readonly overrides: readonly DeliveryAddressOverrideRecord[]
}

/** Leitura simples — o histórico já vem ordenado do repositório (mais recente primeiro). */
export async function listDeliveryAddressHistory(
  input: ListDeliveryAddressHistoryInput,
): Promise<ListDeliveryAddressHistoryResult> {
  const overrides = await input.repository.listHistory(input)
  if (overrides === null) throw new TripDocumentNotFoundError()

  return { overrides }
}
