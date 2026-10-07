/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys, hasKeys } from '@/modules/shared/objectKeys.service'

import {
  CARGO_SETTLEMENT_AMOUNT_SOURCE,
  CARGO_SETTLEMENT_API_PAYER_KINDS,
} from './cargoOccurrenceCase.constant'
import type { CargoCaseResult, CargoSettlementView } from './cargoOccurrenceCase.types'
import { CARGO_OCCURRENCE_CASE_STATUSES } from './cargoOccurrence.constant'
import { CARGO_RECEIVING_ERROR } from './cargoReceiving.constant'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): chave desconhecida é recusada. O item do acerto tem
 * `payerId` (só do motorista) e `reimbursedAt` (só na leitura) opcionais; o resto é obrigatório.
 */
const RESULT_KEYS = ['kind', 'status'] as const
const VIEW_KEYS = ['items', 'total'] as const
const ITEM_REQUIRED = ['amount', 'amountSource', 'payerKind', 'productCode'] as const
const ITEM_ALLOWED = [...ITEM_REQUIRED, 'payerId', 'reimbursedAt'] as const
const AMOUNT_SOURCES: readonly string[] = Object.values(CARGO_SETTLEMENT_AMOUNT_SOURCE)

const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown): boolean =>
  value === undefined || value === null || isString(value)

function invalidResponse(): CargoReceivingRequestError {
  return new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.RESPONSE_INVALID)
}

function readData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw invalidResponse()
  }
  return payload.data
}

function isSettlementItem(value: unknown): boolean {
  return (
    hasKeys(value, { allowed: ITEM_ALLOWED, required: ITEM_REQUIRED }) &&
    isString(value.amount) &&
    isString(value.productCode) &&
    AMOUNT_SOURCES.includes(String(value.amountSource)) &&
    (CARGO_SETTLEMENT_API_PAYER_KINDS as readonly unknown[]).includes(value.payerKind) &&
    isNullableString(value.payerId) &&
    isNullableString(value.reimbursedAt)
  )
}

export function toCaseResult(payload: unknown): CargoCaseResult {
  const data = readData(payload)
  if (
    !hasExactKeys(data, RESULT_KEYS) ||
    (data.kind !== 'changed' && data.kind !== 'unchanged') ||
    !(CARGO_OCCURRENCE_CASE_STATUSES as readonly unknown[]).includes(data.status)
  ) {
    throw invalidResponse()
  }
  return data as CargoCaseResult
}

export function toSettlementView(payload: unknown): CargoSettlementView {
  const data = readData(payload)
  if (
    !hasExactKeys(data, VIEW_KEYS) ||
    !Array.isArray(data.items) ||
    !data.items.every(isSettlementItem) ||
    !isString(data.total)
  ) {
    throw invalidResponse()
  }
  return data as CargoSettlementView
}
