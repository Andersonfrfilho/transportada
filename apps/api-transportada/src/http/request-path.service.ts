/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  API_AUTH_ME_PATH,
  API_AUDIT_EVENTS_PATH,
  API_BILLING_ELIGIBLE_CTES_PATH,
  API_BILLING_INVOICES_PATH,
  API_COMPANY_SETTINGS_PATH,
  API_CTE_BATCHES_PATH,
  API_DIGITAL_CERTIFICATES_PATH,
  API_FREIGHT_CALCULATIONS_PATH,
  API_FREIGHT_RULES_PATH,
  API_LIVE_PATH,
  API_NFE_DOCUMENTS_PATH,
  API_NFE_IMPORTS_PATH,
  API_OPERATIONS_JOBS_PATH,
  API_OPERATIONS_SUMMARY_PATH,
  API_OPERATIONS_TIMELINE_PATH,
  API_READY_PATH,
  UNMATCHED_LOG_PATHNAME,
} from '../shared/api.constant'

export function isNoStorePath(pathname: string): boolean {
  return (
    pathname === API_AUTH_ME_PATH ||
    pathname === API_COMPANY_SETTINGS_PATH ||
    pathname === API_DIGITAL_CERTIFICATES_PATH ||
    pathname === API_FREIGHT_RULES_PATH ||
    pathname.startsWith(`${API_FREIGHT_RULES_PATH}/`) ||
    pathname === API_FREIGHT_CALCULATIONS_PATH ||
    pathname.startsWith(`${API_FREIGHT_CALCULATIONS_PATH}/`) ||
    pathname === API_CTE_BATCHES_PATH ||
    pathname.startsWith(`${API_CTE_BATCHES_PATH}/`) ||
    pathname === API_BILLING_ELIGIBLE_CTES_PATH ||
    pathname.startsWith(`${API_BILLING_ELIGIBLE_CTES_PATH}/`) ||
    pathname === API_BILLING_INVOICES_PATH ||
    pathname.startsWith(`${API_BILLING_INVOICES_PATH}/`) ||
    pathname === API_OPERATIONS_SUMMARY_PATH ||
    pathname === API_OPERATIONS_TIMELINE_PATH ||
    pathname === API_OPERATIONS_JOBS_PATH ||
    pathname === API_AUDIT_EVENTS_PATH ||
    pathname === API_NFE_IMPORTS_PATH ||
    pathname.startsWith(`${API_NFE_IMPORTS_PATH}/`) ||
    pathname === API_NFE_DOCUMENTS_PATH ||
    pathname.startsWith(`${API_NFE_DOCUMENTS_PATH}/`)
  )
}

export function resolveLogPathname(pathname: string): string {
  return pathname === API_AUTH_ME_PATH ||
    pathname === API_COMPANY_SETTINGS_PATH ||
    pathname === API_DIGITAL_CERTIFICATES_PATH ||
    pathname === API_FREIGHT_RULES_PATH ||
    pathname.startsWith(`${API_FREIGHT_RULES_PATH}/`) ||
    pathname === API_FREIGHT_CALCULATIONS_PATH ||
    pathname.startsWith(`${API_FREIGHT_CALCULATIONS_PATH}/`) ||
    pathname === API_CTE_BATCHES_PATH ||
    pathname.startsWith(`${API_CTE_BATCHES_PATH}/`) ||
    pathname === API_BILLING_ELIGIBLE_CTES_PATH ||
    pathname.startsWith(`${API_BILLING_ELIGIBLE_CTES_PATH}/`) ||
    pathname === API_BILLING_INVOICES_PATH ||
    pathname.startsWith(`${API_BILLING_INVOICES_PATH}/`) ||
    pathname === API_OPERATIONS_SUMMARY_PATH ||
    pathname === API_OPERATIONS_TIMELINE_PATH ||
    pathname === API_OPERATIONS_JOBS_PATH ||
    pathname === API_AUDIT_EVENTS_PATH ||
    pathname === API_NFE_IMPORTS_PATH ||
    pathname.startsWith(`${API_NFE_IMPORTS_PATH}/`) ||
    pathname === API_NFE_DOCUMENTS_PATH ||
    pathname.startsWith(`${API_NFE_DOCUMENTS_PATH}/`) ||
    pathname === API_LIVE_PATH ||
    pathname === API_READY_PATH
    ? pathname
    : UNMATCHED_LOG_PATHNAME
}
