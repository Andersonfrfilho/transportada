/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isDocumentProduct,
  isOccurrence,
  isOccurrencesView,
  isReceivingType,
  isReturnResult,
} from './cargoOccurrenceGuards.validation'
import type {
  CargoDocumentProduct,
  CargoOccurrencesView,
  CargoReturnResult,
  ReceivingOccurrenceType,
  RegisterCargoOccurrenceResult,
} from './cargoOccurrence.types'
import { CARGO_RECEIVING_ERROR } from './cargoReceiving.constant'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

function invalidResponse(): CargoReceivingRequestError {
  return new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.RESPONSE_INVALID)
}

function readData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw invalidResponse()
  }
  return payload.data
}

function readList<TItem>(input: {
  isItem: (value: unknown) => value is TItem
  payload: unknown
}): readonly TItem[] {
  const data = readData(input.payload)
  if (!Array.isArray(data) || !data.every(input.isItem)) throw invalidResponse()
  return data
}

export function toReceivingTypes(payload: unknown): readonly ReceivingOccurrenceType[] {
  return readList({ isItem: isReceivingType, payload })
}

export function toDocumentProducts(payload: unknown): readonly CargoDocumentProduct[] {
  return readList({ isItem: isDocumentProduct, payload })
}

export function toOccurrencesView(payload: unknown): CargoOccurrencesView {
  const data = readData(payload)
  if (!isOccurrencesView(data)) throw invalidResponse()
  return data
}

/** 201 na primeira vez e 200 no reenvio com a mesma chave (idempotência). */
export function toRegisterOccurrenceResult(
  input: Readonly<{ payload: unknown; status: number }>,
): RegisterCargoOccurrenceResult {
  const data = readData(input.payload)
  if (!isOccurrence(data)) throw invalidResponse()
  return { isReplay: input.status === 200, occurrence: data }
}

export function toReturnResult(payload: unknown): CargoReturnResult {
  const data = readData(payload)
  if (!isReturnResult(data)) throw invalidResponse()
  return data
}
