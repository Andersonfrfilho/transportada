/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D2 (ADR-0079 §A3): a forma de "quem recebeu". Duas entradas, uma regra de forma:
 *
 * - **motorista** (`normalizeReceivedBy`): tolerante, **nunca** lança. O anexo sobe pela fila do
 *   aparelho, e um 400 viraria `rejectionCause` — a foto seria descartada em 7 dias (C1).
 * - **escritório** (`parseReceivedByStrict`): síncrono, responde 400 com `details` no campo.
 */
import {
  RECEIVED_BY_DETAIL_MAX_LENGTH,
  RECEIVED_BY_OPTIONS,
  RECEIVED_BY_OPTIONS_REQUIRING_DETAIL,
  type ReceivedBy,
} from '../../database/trip.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

export type ReceivedByValue = {
  readonly receivedBy: ReceivedBy | null
  readonly receivedByDetail: string | null
}

export type ReceivedByRawInput = {
  readonly receivedBy?: unknown
  readonly receivedByDetail?: unknown
}

const CONTROL_CHARACTERS = /\p{Cc}/gu
const FIELD = { receivedBy: 'receivedBy', receivedByDetail: 'receivedByDetail' } as const

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '').trim() : ''
}

function toReceivedBy(value: unknown): ReceivedBy | null {
  const code = cleanText(value)
  return RECEIVED_BY_OPTIONS.find((option) => option === code) ?? null
}

function requiresDetail(receivedBy: ReceivedBy): boolean {
  return RECEIVED_BY_OPTIONS_REQUIRING_DETAIL.some((option) => option === receivedBy)
}

/** Código fora da lista vira nulo, e o detalhe sem relação vai junto. Vazio é nulo. */
export function normalizeReceivedBy(input: ReceivedByRawInput): ReceivedByValue {
  const receivedBy = toReceivedBy(input.receivedBy)
  if (receivedBy === null) return { receivedBy: null, receivedByDetail: null }

  const detail = cleanText(input.receivedByDetail).slice(0, RECEIVED_BY_DETAIL_MAX_LENGTH)
  return { receivedBy, receivedByDetail: detail === '' ? null : detail }
}

function listStrictViolations(input: ReceivedByRawInput): readonly ApiErrorDetail[] {
  const code = cleanText(input.receivedBy)
  const detail = cleanText(input.receivedByDetail)
  const receivedBy = toReceivedBy(input.receivedBy)
  if (code !== '' && receivedBy === null) {
    return [{ field: FIELD.receivedBy, message: 'Unknown receivedBy option.' }]
  }
  if (receivedBy === null) {
    return detail === ''
      ? []
      : [{ field: FIELD.receivedByDetail, message: 'receivedByDetail requires receivedBy.' }]
  }
  if (detail.length > RECEIVED_BY_DETAIL_MAX_LENGTH) {
    return [{ field: FIELD.receivedByDetail, message: 'receivedByDetail is too long.' }]
  }
  if (detail === '' && requiresDetail(receivedBy)) {
    return [{ field: FIELD.receivedByDetail, message: 'receivedByDetail is required.' }]
  }
  return []
}

export function parseReceivedByStrict(input: ReceivedByRawInput): ReceivedByValue {
  const details = listStrictViolations(input)
  if (details.length > 0) throw new ApiError({ ...HTTP_ERROR.invalidRequest, details })
  return normalizeReceivedBy(input)
}
