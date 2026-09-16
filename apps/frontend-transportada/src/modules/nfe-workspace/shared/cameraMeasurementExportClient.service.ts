/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CameraMeasurementExportEntry } from './cameraMeasurementValidation.service'

const CAMERA_MEASUREMENT_EXPORT_ERROR = {
  REQUEST_FAILED: 'CAMERA_MEASUREMENT_EXPORT_REQUEST_FAILED',
  RESPONSE_INVALID: 'CAMERA_MEASUREMENT_EXPORT_RESPONSE_INVALID',
} as const

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type CameraMeasurementExportPage = Readonly<{
  items: readonly CameraMeasurementExportEntry[]
  nextCursor: null | string
}>

export type ListCameraMeasurementExportInput = Readonly<{
  cursor: null | string
  from: string | undefined
  limit: number
  to: string | undefined
}>

export type CameraMeasurementExportClient = Readonly<{
  listMeasurements: (
    input: ListCameraMeasurementExportInput,
  ) => Promise<CameraMeasurementExportPage>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isNullableNumber(value: unknown): value is null | number {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

const EXPORT_SOURCES = ['camera', 'camera_adjusted', 'typed']

function isEntry(value: unknown): value is CameraMeasurementExportEntry {
  if (!isRecord(value)) return false
  return (
    isNullableString(value.cartonGtin) &&
    isString(value.createdAt) &&
    isNullableNumber(value.heightMarginMm) &&
    typeof value.heightMm === 'number' &&
    isString(value.id) &&
    isNullableNumber(value.lengthMarginMm) &&
    typeof value.lengthMm === 'number' &&
    isString(value.productCode) &&
    isNullableNumber(value.proposedHeightMm) &&
    isNullableNumber(value.proposedLengthMm) &&
    isNullableNumber(value.proposedWidthMm) &&
    isString(value.source) &&
    EXPORT_SOURCES.includes(value.source) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isString) &&
    isNullableNumber(value.widthMarginMm) &&
    typeof value.widthMm === 'number'
  )
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return CAMERA_MEASUREMENT_EXPORT_ERROR.REQUEST_FAILED
}

async function requestJson(dependencies: ClientDependencies, path: string): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    )
  } catch {
    throw requestError(CAMERA_MEASUREMENT_EXPORT_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw requestError(
      response.ok
        ? CAMERA_MEASUREMENT_EXPORT_ERROR.RESPONSE_INVALID
        : CAMERA_MEASUREMENT_EXPORT_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

function readPage(payload: unknown): CameraMeasurementExportPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw requestError(CAMERA_MEASUREMENT_EXPORT_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isEntry)) {
    throw requestError(CAMERA_MEASUREMENT_EXPORT_ERROR.RESPONSE_INVALID)
  }
  const nextCursor = payload.page.nextCursor
  if (!isNullableString(nextCursor))
    throw requestError(CAMERA_MEASUREMENT_EXPORT_ERROR.RESPONSE_INVALID)
  return { items: payload.data, nextCursor }
}

function buildSearch(input: ListCameraMeasurementExportInput): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  if (input.from !== undefined) search.set('from', input.from)
  if (input.to !== undefined) search.set('to', input.to)
  search.set('limit', String(input.limit))
  return search.toString()
}

/**
 * Spec 152 T5/T12 (R8): `GET /nfe-package-box-measurements`, `settings.manage` — export do
 * histórico inteiro da empresa para a validação, separado do cliente de medição (`cargo.measure`).
 */
export function createCameraMeasurementExportClient(
  dependencies: ClientDependencies,
): CameraMeasurementExportClient {
  return {
    async listMeasurements(input) {
      const search = buildSearch(input)
      const payload = await requestJson(dependencies, `/nfe-package-box-measurements?${search}`)
      return readPage(payload)
    },
  }
}
