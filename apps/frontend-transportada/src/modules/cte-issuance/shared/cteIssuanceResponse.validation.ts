/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteIssuanceDocument,
  CteIssuanceDocumentPage,
  CteIssuanceRequest,
  CteIssuanceStatus,
  CteIssuanceSummary,
} from './cteIssuanceClient.service'

function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStatus(value: unknown): value is CteIssuanceStatus {
  return (
    isString(value) &&
    ['authorized', 'failed', 'rejected', 'requested', 'retry_scheduled'].includes(value)
  )
}

function rejectExtraKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) throw validationError(code)
}

function envelopeData(value: unknown, code: string): unknown {
  if (!isRecord(value) || !('data' in value)) throw validationError(code)
  rejectExtraKeys(value, ['data', 'page'], code)
  return value.data
}

function readNextCursor(value: unknown, code: string): null | string {
  if (!isRecord(value) || !isRecord(value.page)) throw validationError(code)
  rejectExtraKeys(value.page, ['nextCursor'], code)
  const nextCursor = value.page.nextCursor
  if (nextCursor !== null && !isString(nextCursor)) throw validationError(code)
  return nextCursor
}

function optionalString(value: unknown, code: string): string | undefined {
  if (value === undefined) return undefined
  if (!isString(value)) throw validationError(code)
  return value
}

function optionalStringField(input: {
  readonly code: string
  readonly key: string
  readonly value: unknown
}): Record<string, string> {
  if (input.value === undefined) return {}
  const value = optionalString(input.value, input.code)
  if (value === undefined) return {}
  return { [input.key]: value }
}

function issuanceFromData(input: unknown): CteIssuanceSummary {
  if (!isRecord(input)) throw validationError('CTE_ISSUANCE_INVALID_RESPONSE')
  rejectExtraKeys(
    input,
    [
      'accessKey',
      'attemptId',
      'batchId',
      'batchItemId',
      'environment',
      'protocol',
      'reasonCause',
      'reasonCode',
      'status',
      'updatedAt',
    ],
    'CTE_ISSUANCE_INVALID_RESPONSE',
  )
  if (
    !isString(input.attemptId) ||
    !isString(input.batchId) ||
    !isString(input.batchItemId) ||
    input.environment !== 'homologation' ||
    !isStatus(input.status) ||
    !isString(input.updatedAt)
  ) {
    throw validationError('CTE_ISSUANCE_INVALID_RESPONSE')
  }
  return {
    ...optionalStringField({
      code: 'CTE_ISSUANCE_INVALID_RESPONSE',
      key: 'accessKey',
      value: input.accessKey,
    }),
    attemptId: input.attemptId,
    batchId: input.batchId,
    batchItemId: input.batchItemId,
    environment: input.environment,
    ...optionalStringField({
      code: 'CTE_ISSUANCE_INVALID_RESPONSE',
      key: 'protocol',
      value: input.protocol,
    }),
    ...optionalStringField({
      code: 'CTE_ISSUANCE_INVALID_RESPONSE',
      key: 'reasonCause',
      value: input.reasonCause,
    }),
    ...optionalStringField({
      code: 'CTE_ISSUANCE_INVALID_RESPONSE',
      key: 'reasonCode',
      value: input.reasonCode,
    }),
    status: input.status,
    updatedAt: input.updatedAt,
  }
}

function documentFromData(input: unknown): CteIssuanceDocument {
  if (!isRecord(input)) throw validationError('CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE')
  rejectExtraKeys(
    input,
    ['accessKey', 'contentType', 'documentId', 'downloadUrl', 'expiresAt', 'sha256'],
    'CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE',
  )
  if (
    !isString(input.accessKey) ||
    input.contentType !== 'application/xml' ||
    !isString(input.documentId) ||
    !isString(input.downloadUrl) ||
    !isString(input.expiresAt) ||
    !isString(input.sha256)
  ) {
    throw validationError('CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE')
  }
  return {
    accessKey: input.accessKey,
    contentType: input.contentType,
    documentId: input.documentId,
    downloadUrl: input.downloadUrl,
    expiresAt: input.expiresAt,
    sha256: input.sha256,
  }
}

function requestFromData(input: unknown): CteIssuanceRequest {
  if (!isRecord(input)) throw validationError('CTE_ISSUANCE_INVALID_RESPONSE')
  rejectExtraKeys(input, ['batchId', 'requestedAt', 'status'], 'CTE_ISSUANCE_INVALID_RESPONSE')
  if (!isString(input.batchId) || !isString(input.requestedAt) || input.status !== 'requested') {
    throw validationError('CTE_ISSUANCE_INVALID_RESPONSE')
  }
  return { batchId: input.batchId, requestedAt: input.requestedAt, status: input.status }
}

export function createCteIssuanceResponseAdapters() {
  return {
    documentPageFromApi(input: unknown): CteIssuanceDocumentPage {
      const data = envelopeData(input, 'CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE')
      if (!Array.isArray(data)) throw validationError('CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE')
      return {
        items: data.map(documentFromData),
        nextCursor: readNextCursor(input, 'CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE'),
      }
    },
    issuanceFromApi(input: unknown): CteIssuanceSummary {
      return issuanceFromData(envelopeData(input, 'CTE_ISSUANCE_INVALID_RESPONSE'))
    },
    requestFromApi(input: unknown): CteIssuanceRequest {
      return requestFromData(input)
    },
  }
}
