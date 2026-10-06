/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoPreviewArrivalProposal,
  CargoPreviewDetail,
  CargoPreviewItemOutcome,
  CargoPreviewPage,
  CargoPreviewProfileFlags,
  CargoPreviewSummary,
  UploadCargoPreviewResult,
} from './cargoPreview.types'
import type { CargoPreviewTripDrafts } from './cargoPreviewTripDraft.types'
import { isArrivalProposal, isItemOutcome, isPreviewSummary } from './cargoPreviewGuards.validation'
import { isTripDrafts } from './cargoPreviewTripDraftGuards.validation'
import { isPreviewDetail } from './cargoPreviewItemGuards.validation'
import { CARGO_RECEIVING_ERROR } from './cargoReceiving.constant'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

function invalidResponse(): CargoReceivingRequestError {
  return new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.RESPONSE_INVALID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readData(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) throw invalidResponse()
  return payload.data
}

/** A lista devolve `{ data, nextCursor }` no topo, como a das chegadas. */
export function toPreviewPage(payload: unknown): CargoPreviewPage<CargoPreviewSummary> {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw invalidResponse()
  const { nextCursor } = payload
  if (nextCursor !== null && typeof nextCursor !== 'string') throw invalidResponse()
  if (!payload.data.every(isPreviewSummary)) throw invalidResponse()
  return { items: payload.data, nextCursor }
}

export function toPreviewDetail(payload: unknown): CargoPreviewDetail {
  const data = readData(payload)
  if (!isPreviewDetail(data)) throw invalidResponse()
  return data
}

/** O servidor responde 201 na primeira vez e 200 na repetição do mesmo arquivo (idempotência). */
export function toUploadResult(payload: unknown, status: number): UploadCargoPreviewResult {
  const data = readData(payload)
  if (!isPreviewSummary(data)) throw invalidResponse()
  return { isReplay: status === 200, preview: data }
}

export function toItemOutcome(payload: unknown): CargoPreviewItemOutcome {
  const data = readData(payload)
  if (!isItemOutcome(data)) throw invalidResponse()
  return data
}

export function toProposal(payload: unknown): CargoPreviewArrivalProposal {
  const data = readData(payload)
  if (!isArrivalProposal(data)) throw invalidResponse()
  return data
}

/** Os rascunhos de viagem (RF7): o envelope `{ data }` e as chaves exatas em cada nível. */
export function toTripDrafts(payload: unknown): CargoPreviewTripDrafts {
  const data = readData(payload)
  if (!isTripDrafts(data)) throw invalidResponse()
  return data
}

/**
 * Projeção: só os dois interruptores. O perfil inteiro é do módulo que o possui (`delivery-clients`, com a
 * guarda de chaves exatas dele). `{ data: null }` é contratante sem perfil — ausência de regra, não erro.
 */
export function toProfileFlags(payload: unknown): CargoPreviewProfileFlags {
  const data = readData(payload)
  if (data === null) return { isEnabled: false, previewEnabled: false }
  if (
    !isRecord(data) ||
    typeof data.isEnabled !== 'boolean' ||
    typeof data.previewEnabled !== 'boolean'
  ) {
    throw invalidResponse()
  }
  return { isEnabled: data.isEnabled, previewEnabled: data.previewEnabled }
}
