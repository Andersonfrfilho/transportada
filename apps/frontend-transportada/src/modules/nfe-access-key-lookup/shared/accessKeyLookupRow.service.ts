/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  REQUEST_FAILED_CODE,
  RESPONSE_INVALID_CODE,
  type LookupReason,
} from './accessKeyLookup.constant'
import type { AccessKeyLookupView, RequestLookupResult } from './accessKeyLookupClient.service'

export type AccessKeyLookupRowState =
  | Readonly<{ kind: 'checking' }>
  | Readonly<{ code: string; kind: 'error' }>
  | Readonly<{ documentId: string; kind: 'ready' }>
  | Readonly<{ kind: 'failed'; reason: LookupReason }>
  | Readonly<{ kind: 'refused'; reason: LookupReason }>
  | Readonly<{ kind: 'searching'; status: 'querying' | 'queued' }>
  | Readonly<{ kind: 'stalled' }>
  | Readonly<{ kind: 'waiting'; notBefore: null | string }>

export type AccessKeyLookupRow = Readonly<{
  accessKey: string
  lookupId: null | string
  state: AccessKeyLookupRowState
  /** A conferência em lote achou a nota já cadastrada (não foi importada por esta busca). */
  wasRegistered?: boolean
}>

export type AccessKeyLookupRowFlags = Readonly<{
  canAdd: boolean
  canRetry: boolean
  canSendXml: boolean
  isTerminal: boolean
}>

export type ParsedAccessKey = Readonly<{
  federalUnitCode: string
  issuedMonth: string
  issuerTaxId: string
  model: string
  number: string
  series: string
}>

const XML_BLOCKED_REASONS: readonly LookupReason[] = ['cancelled', 'denied']
const GENERIC_ERROR_KEY = 'error.generic'
const KNOWN_ERROR_CODES: readonly string[] = [
  'INVALID_ACCESS_KEY',
  'NFE_ACCESS_KEY_LOOKUP_CONFLICT',
  'NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL',
  'NFE_DISTRIBUTION_NOT_CONFIGURED',
  'RATE_LIMITED',
  REQUEST_FAILED_CODE,
  RESPONSE_INVALID_CODE,
]

function stripLeadingZeros(value: string): string {
  return String(Number(value))
}

/** Posições da chave de 44 posições: cUF 0–1, AAMM 2–5, CNPJ 6–19, modelo 20–21, série 22–24, número 25–33. */
export function parseAccessKey(accessKey: string): ParsedAccessKey {
  return {
    federalUnitCode: accessKey.slice(0, 2),
    issuedMonth: `${accessKey.slice(4, 6)}/20${accessKey.slice(2, 4)}`,
    issuerTaxId: accessKey.slice(6, 20),
    model: accessKey.slice(20, 22),
    number: stripLeadingZeros(accessKey.slice(25, 34)),
    series: stripLeadingZeros(accessKey.slice(22, 25)),
  }
}

export function createCheckingRow(accessKey: string): AccessKeyLookupRow {
  return { accessKey, lookupId: null, state: { kind: 'checking' } }
}

export function withState(
  row: AccessKeyLookupRow,
  state: AccessKeyLookupRowState,
  lookupId: null | string = row.lookupId,
): AccessKeyLookupRow {
  return { ...row, lookupId, state }
}

export function stateFromLookupView(view: AccessKeyLookupView): AccessKeyLookupRowState {
  switch (view.status) {
    case 'queued':
    case 'querying':
      return { kind: 'searching', status: view.status }
    case 'waiting':
      return { kind: 'waiting', notBefore: view.notBefore }
    case 'imported':
      return view.documentId === null
        ? { code: RESPONSE_INVALID_CODE, kind: 'error' }
        : { documentId: view.documentId, kind: 'ready' }
    case 'refused':
    case 'failed':
      return view.reason === null
        ? { code: RESPONSE_INVALID_CODE, kind: 'error' }
        : { kind: view.status, reason: view.reason }
  }
}

export function stateFromRequestResult(result: RequestLookupResult): AccessKeyLookupRowState {
  if (result.kind === 'found') return { documentId: result.documentId, kind: 'ready' }
  return stateFromLookupView(result.lookup)
}

export function deriveRowFlags(state: AccessKeyLookupRowState): AccessKeyLookupRowFlags {
  const canSendXml =
    (state.kind === 'refused' || state.kind === 'failed') &&
    !XML_BLOCKED_REASONS.includes(state.reason)
  const canRetry =
    state.kind === 'error' ||
    state.kind === 'stalled' ||
    (state.kind === 'failed' && state.reason === 'sefaz_unavailable')

  return {
    canAdd: state.kind === 'ready',
    canRetry,
    canSendXml,
    isTerminal: state.kind === 'ready' || state.kind === 'refused' || state.kind === 'failed',
  }
}

/** Chave do locale (`accessKeyLookup`) do texto que explica o estado, ou `undefined` quando o estado se explica sozinho. */
export function describeRowState(state: AccessKeyLookupRowState): string | undefined {
  switch (state.kind) {
    case 'refused':
    case 'failed':
      return `reason.${state.reason}`
    case 'error':
      return KNOWN_ERROR_CODES.includes(state.code) ? `error.${state.code}` : GENERIC_ERROR_KEY
    case 'stalled':
      return 'state.stalled'
    case 'checking':
    case 'ready':
    case 'searching':
    case 'waiting':
      return undefined
  }
}
