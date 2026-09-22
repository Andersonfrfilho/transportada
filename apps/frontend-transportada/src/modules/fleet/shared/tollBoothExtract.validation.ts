/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `GET /v1/toll-booths/extracts` e `POST /v1/toll-booths/reload` (spec 154 RF3/RF4) — a linha do
 * extrato registrado e o resultado da recarga, na forma exata que
 * `toll-booth-extract.routes.ts` serializa.
 */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { isNullableString, isString, isUnsignedIntegerNumber } from './fleetGuards.validation'

const EXTRACT_ROW_KEYS = [
  'boothCount',
  'boothsWithAxleCharge',
  'boothsWithCharge',
  'dataset',
  'missingObjectObservedAt',
  'objectKey',
  'observedOn',
  'reloadedAt',
  'reloadedBoothCount',
  'reloadedByUserId',
  'sha256',
  'uploadedByUserId',
] as const

const RELOAD_RESULT_KEYS = [
  'boothsMissingFromExtract',
  'catalogBoothCount',
  'dataset',
  'observedOn',
  'reloadedAt',
  'reloadedByUserId',
  'savedBoothCount',
] as const

/** Uma linha de `toll_booth_extracts` (D10) — dataset, data, contagens, sha256 e quem subiu. */
export type TollBoothExtractRow = Readonly<{
  boothCount: number
  boothsWithAxleCharge: number
  boothsWithCharge: number
  dataset: string
  missingObjectObservedAt: string | null
  objectKey: string
  observedOn: string
  reloadedAt: string | null
  reloadedBoothCount: number | null
  reloadedByUserId: string | null
  sha256: string
  uploadedByUserId: string
}>

/** O que `POST /v1/toll-booths/reload` devolve — quantas praças gravadas e a data do extrato usado. */
export type TollBoothReloadResult = Readonly<{
  boothsMissingFromExtract: number
  catalogBoothCount: number
  dataset: string
  observedOn: string
  reloadedAt: string
  reloadedByUserId: string
  savedBoothCount: number
}>

function isNullableUnsignedIntegerNumber(value: unknown): value is null | number {
  return value === null || isUnsignedIntegerNumber(value)
}

export function isTollBoothExtractRow(value: unknown): value is TollBoothExtractRow {
  return (
    hasExactKeys(value, EXTRACT_ROW_KEYS) &&
    isUnsignedIntegerNumber(value.boothCount) &&
    isUnsignedIntegerNumber(value.boothsWithAxleCharge) &&
    isUnsignedIntegerNumber(value.boothsWithCharge) &&
    isString(value.dataset) &&
    isNullableString(value.missingObjectObservedAt) &&
    isString(value.objectKey) &&
    isString(value.observedOn) &&
    isNullableString(value.reloadedAt) &&
    isNullableUnsignedIntegerNumber(value.reloadedBoothCount) &&
    isNullableString(value.reloadedByUserId) &&
    isString(value.sha256) &&
    isString(value.uploadedByUserId)
  )
}

export function isTollBoothExtractRowList(value: unknown): value is readonly TollBoothExtractRow[] {
  return Array.isArray(value) && value.every(isTollBoothExtractRow)
}

export function isTollBoothReloadResult(value: unknown): value is TollBoothReloadResult {
  return (
    hasExactKeys(value, RELOAD_RESULT_KEYS) &&
    isUnsignedIntegerNumber(value.boothsMissingFromExtract) &&
    isUnsignedIntegerNumber(value.catalogBoothCount) &&
    isString(value.dataset) &&
    isString(value.observedOn) &&
    isString(value.reloadedAt) &&
    isString(value.reloadedByUserId) &&
    isUnsignedIntegerNumber(value.savedBoothCount)
  )
}
