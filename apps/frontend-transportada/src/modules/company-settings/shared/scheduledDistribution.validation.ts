import { hasExactKeys } from '@/modules/shared/objectKeys.service'
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './companySettingsResponse.validation'

const STATUS_KEYS = [
  'certificateExpiresAt',
  'eligible',
  'enabled',
  'ineligibilityReason',
  'lastAutomationImport',
  'nextAllowedAt',
  'nextScheduledRunAt',
]
const AUTOMATION_IMPORT_KEYS = ['finishedAt', 'receivedCount', 'startedAt', 'status']

export type ScheduledDistributionRun = Readonly<{
  finishedAt: string | null
  receivedCount: number
  startedAt: string
  status: string
}>

export type ScheduledDistributionStatus = Readonly<{
  certificateExpiresAt: string | null
  eligible: boolean
  enabled: boolean
  ineligibilityReason: string | null
  lastAutomationImport: ScheduledDistributionRun | null
  nextAllowedAt: string | null
  nextScheduledRunAt: string | null
}>

export type ScheduledDistributionResponse = Readonly<{ data: ScheduledDistributionStatus }>

function isNullableIsoDate(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isAutomationRun(value: unknown): value is ScheduledDistributionRun {
  if (!isRecord(value) || !hasExactKeys(value, AUTOMATION_IMPORT_KEYS)) return false
  return (
    isNullableIsoDate(value.finishedAt) &&
    typeof value.receivedCount === 'number' &&
    Number.isInteger(value.receivedCount) &&
    value.receivedCount >= 0 &&
    typeof value.startedAt === 'string' &&
    isNullableIsoDate(value.startedAt) &&
    typeof value.status === 'string'
  )
}

export function isScheduledDistributionStatus(
  value: unknown,
): value is ScheduledDistributionStatus {
  if (!isRecord(value) || !hasExactKeys(value, STATUS_KEYS)) return false
  return (
    isNullableIsoDate(value.certificateExpiresAt) &&
    typeof value.eligible === 'boolean' &&
    typeof value.enabled === 'boolean' &&
    (value.ineligibilityReason === null || typeof value.ineligibilityReason === 'string') &&
    (value.lastAutomationImport === null || isAutomationRun(value.lastAutomationImport)) &&
    isNullableIsoDate(value.nextAllowedAt) &&
    isNullableIsoDate(value.nextScheduledRunAt)
  )
}

export function isScheduledDistributionResponse(
  value: unknown,
): value is ScheduledDistributionResponse {
  return (
    isRecord(value) && hasExactKeys(value, ['data']) && isScheduledDistributionStatus(value.data)
  )
}
