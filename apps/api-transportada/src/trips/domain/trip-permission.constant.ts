/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'

/**
 * ADR-0067: a baixa do escritório em nome do motorista. Nome próprio porque aparece na política das
 * rotas do escritório, na leitura do `finance` (D11) e na trilha de `audit_logs`.
 */
export const TRIP_REPORT_ON_BEHALF_PERMISSION =
  'trip.report-on-behalf' as const satisfies CompanyPermission
