/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isArrivalDetail,
  isArrivalSummary,
  isAvailableDocument,
  isDocumentOutcome,
} from './cargoArrivalGuards.validation'
import type {
  AvailableCargoDocument,
  CargoArrivalDetail,
  CargoArrivalSummary,
  CargoContractor,
  CargoDocumentOutcome,
  CargoPage,
  CargoReceivingProfile,
  CloseCargoArrivalResult,
  RegisterCargoArrivalResult,
} from './cargoArrival.types'
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CARGO_RECEIVING_ERROR } from './cargoReceiving.constant'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

function invalidResponse(): CargoReceivingRequestError {
  return new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.RESPONSE_INVALID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A lista da chegada devolve `{ data, nextCursor }` no topo — ao contrário da de contratantes. */
function toPage<TItem>(input: {
  isItem: (value: unknown) => value is TItem
  payload: unknown
}): CargoPage<TItem> {
  const { payload } = input
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw invalidResponse()
  const { nextCursor } = payload
  if (nextCursor !== null && typeof nextCursor !== 'string') throw invalidResponse()
  if (!payload.data.every(input.isItem)) throw invalidResponse()
  return { items: payload.data, nextCursor }
}

export function toArrivalPage(payload: unknown): CargoPage<CargoArrivalSummary> {
  return toPage({ isItem: isArrivalSummary, payload })
}

export function toAvailableDocumentPage(payload: unknown): CargoPage<AvailableCargoDocument> {
  return toPage({ isItem: isAvailableDocument, payload })
}

export function toArrivalDetail(payload: unknown): CargoArrivalDetail {
  if (!isRecord(payload) || !isArrivalDetail(payload.data)) throw invalidResponse()
  return payload.data
}

/** O servidor responde 201 na primeira vez e 200 na repetição com a mesma chave (idempotência). */
export function toRegisterResult(
  input: Readonly<{ payload: unknown; status: number }>,
): RegisterCargoArrivalResult {
  return { arrival: toArrivalDetail(input.payload), isReplay: input.status === 200 }
}

export function toBatchOutcomes(payload: unknown): readonly CargoDocumentOutcome[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.results)) {
    throw invalidResponse()
  }
  const { results } = payload.data
  if (!results.every(isDocumentOutcome)) throw invalidResponse()
  return results
}

export function toCloseResult(payload: unknown): CloseCargoArrivalResult {
  if (!isRecord(payload) || !isRecord(payload.data)) throw invalidResponse()
  const { arrivalId, outcome } = payload.data
  if (typeof arrivalId !== 'string' || (outcome !== 'changed' && outcome !== 'unchanged')) {
    throw invalidResponse()
  }
  return { arrivalId, outcome }
}

/**
 * Projeção: só quem é o contratante. A ficha inteira e o perfil são do módulo que as possui
 * (`delivery-clients`, com a guarda de chaves exatas dele); aqui o resto é lido e descartado.
 */
export function toContractorPage(payload: unknown): CargoPage<CargoContractor> {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw invalidResponse()
  }
  const { nextCursor } = payload.page
  if (nextCursor !== null && typeof nextCursor !== 'string') throw invalidResponse()
  const items = payload.data.map((entry: unknown): CargoContractor => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.displayName !== 'string' ||
      typeof entry.taxId !== 'string'
    ) {
      throw invalidResponse()
    }
    return { displayName: entry.displayName, id: entry.id, taxId: entry.taxId }
  })
  return { items, nextCursor }
}

const PROFILE_KEYS = ['contractorId', 'isEnabled', 'previewEnabled'] as const

function isReceivingProfile(value: unknown): value is CargoReceivingProfile {
  return (
    hasExactKeys(value, PROFILE_KEYS) &&
    typeof value.contractorId === 'string' &&
    typeof value.isEnabled === 'boolean' &&
    typeof value.previewEnabled === 'boolean'
  )
}

/** `GET /contractor-receiving-profiles`: `{ data, nextCursor }` no topo; contratante sem perfil não aparece. */
export function toReceivingProfilePage(payload: unknown): CargoPage<CargoReceivingProfile> {
  return toPage({ isItem: isReceivingProfile, payload })
}
