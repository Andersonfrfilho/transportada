import { hasExactKeys } from '@/modules/shared/objectKeys.service'
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './companySettingsResponse.validation'

const CURSOR_KEYS = [
  'consecutiveRateLimits',
  'environment',
  'lastSkipped',
  'maxNsu',
  'nextAllowedAt',
  'ultNsu',
  'updatedAt',
]
const SKIP_KEYS = ['at', 'fromNsu', 'toNsu']

export const DISTRIBUTION_CURSOR_NSU_LENGTH = 15

export type DistributionCursorSkip = Readonly<{
  at: string
  fromNsu: string
  toNsu: string
}>

export type DistributionCursor = Readonly<{
  consecutiveRateLimits: number
  environment: string
  lastSkipped: DistributionCursorSkip | null
  maxNsu: string
  nextAllowedAt: string | null
  ultNsu: string
  updatedAt: string
}>

export type DistributionCursorResponse = Readonly<{ data: DistributionCursor }>

function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isNsu(value: unknown): value is string {
  return (
    typeof value === 'string' && new RegExp(`^\\d{${DISTRIBUTION_CURSOR_NSU_LENGTH}}$`).test(value)
  )
}

function isSkip(value: unknown): value is DistributionCursorSkip {
  if (!isRecord(value) || !hasExactKeys(value, SKIP_KEYS)) return false
  return isIsoDate(value.at) && isNsu(value.fromNsu) && isNsu(value.toNsu)
}

export function isDistributionCursor(value: unknown): value is DistributionCursor {
  if (!isRecord(value) || !hasExactKeys(value, CURSOR_KEYS)) return false
  return (
    typeof value.consecutiveRateLimits === 'number' &&
    Number.isInteger(value.consecutiveRateLimits) &&
    value.consecutiveRateLimits >= 0 &&
    typeof value.environment === 'string' &&
    (value.lastSkipped === null || isSkip(value.lastSkipped)) &&
    isNsu(value.maxNsu) &&
    (value.nextAllowedAt === null || isIsoDate(value.nextAllowedAt)) &&
    isNsu(value.ultNsu) &&
    isIsoDate(value.updatedAt)
  )
}

export function isDistributionCursorResponse(value: unknown): value is DistributionCursorResponse {
  return isRecord(value) && hasExactKeys(value, ['data']) && isDistributionCursor(value.data)
}

export function isDistributionCursorNsu(value: string): boolean {
  return isNsu(value)
}
