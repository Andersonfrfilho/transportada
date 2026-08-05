/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BootstrapFirstAdminResponse, BootstrapFirstAdminResult } from './bootstrap.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBootstrapFirstAdminResult(value: unknown): value is BootstrapFirstAdminResult {
  return (
    isRecord(value) &&
    typeof value.companyId === 'string' &&
    typeof value.subject === 'string' &&
    typeof value.userId === 'string'
  )
}

export function isBootstrapFirstAdminResponse(
  value: unknown,
): value is BootstrapFirstAdminResponse {
  return isRecord(value) && isBootstrapFirstAdminResult(value.data)
}
