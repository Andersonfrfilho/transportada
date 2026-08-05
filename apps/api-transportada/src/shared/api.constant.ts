/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const API_SERVICE_NAME = 'api'
export const API_HOSTNAME = '0.0.0.0'
export const API_LIVE_PATH = '/health/live'
export const API_READY_PATH = '/health/ready'
export const API_AUTH_ME_PATH = '/auth/me'
export const API_BOOTSTRAP_FIRST_ADMIN_PATH = '/bootstrap/first-admin'
export const API_COMPANY_SETTINGS_PATH = '/company-settings'
export const API_COMPANY_SETTINGS_CNPJ_LOOKUP_PATH = '/company-settings/cnpj-info'
export const API_COMPANY_SETTINGS_LOGO_PATH = '/company-settings/logo'
export const API_DIGITAL_CERTIFICATES_PATH = '/digital-certificates'
export const API_FREIGHT_RULES_PATH = '/freight-rules'
export const API_FREIGHT_CALCULATIONS_PATH = '/freight-calculations'
export const API_FLEET_VEHICLES_PATH = '/fleet/vehicles'
export const API_FLEET_DRIVERS_PATH = '/fleet/drivers'
export const API_FLEET_VEHICLE_LOOKUP_PATH = '/fleet/vehicles/lookup'
export const API_FLEET_CAPABILITIES_PATH = '/fleet/capabilities'
export const API_MDFE_MANIFESTS_PATH = '/mdfe-manifests'
export const API_MDFE_MANIFESTS_PREVIEW_PATH = '/mdfe-manifests/preview'
export const API_TRIPS_PATH = '/trips'
export const API_CTE_BATCHES_PATH = '/cte-batches'
export const API_CTE_BATCH_ITEMS_PATH = '/cte-batch-items'
export const API_CTE_EMISSION_PROFILES_PATH = '/cte-emission-profiles'
export const API_BILLING_ELIGIBLE_CTES_PATH = '/billing/eligible-ctes'
export const API_BILLING_INVOICES_PATH = '/billing/invoices'
export const API_BILLING_INVOICE_PREVIEW_PATH = '/billing/invoices/preview'
export const API_OPERATIONS_SUMMARY_PATH = '/operations/summary'
export const API_OPERATIONS_TIMELINE_PATH = '/operations/timeline'
export const API_OPERATIONS_JOBS_PATH = '/operations/jobs'
export const API_AUDIT_EVENTS_PATH = '/audit/events'
export const API_NFE_IMPORTS_PATH = '/nfe-imports'
export const API_NFE_IMPORTS_XML_PATH = '/nfe-imports/xml'
export const API_NFE_IMPORTS_DISTRIBUTION_PATH = '/nfe-imports/distribution'
export const API_NFE_DOCUMENTS_PATH = '/nfe-documents'
export const API_VIEW_PREFERENCES_PATH = '/view-preferences'
export const CORRELATION_ID_HEADER = 'x-correlation-id'
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
export const HTTP_GET_METHOD = 'GET'
export const HTTP_OPTIONS_METHOD = 'OPTIONS'
export const CORS_ALLOW_HEADERS = 'Authorization'
export const CORS_MAX_AGE_SECONDS = 300
export const APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = 1_048_576
export const SERVER_MAX_REQUEST_BODY_SIZE_BYTES = 2_097_152
export const IDLE_TIMEOUT_SECONDS = 10
export const REQUEST_TIMEOUT_SECONDS = 10
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
export const INVALID_LOG_PATHNAME = '<invalid>'
export const UNMATCHED_LOG_PATHNAME = '<unmatched>'

export const HTTP_ERROR = {
  internal: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    status: 500,
  },
  invalidRequest: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request',
    status: 400,
  },
  unauthenticated: {
    code: 'UNAUTHENTICATED',
    message: 'Authentication required',
    status: 401,
  },
  forbidden: {
    code: 'FORBIDDEN',
    message: 'Access denied',
    status: 403,
  },
  methodNotAllowed: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed',
    status: 405,
  },
  payloadTooLarge: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body too large',
    status: 413,
  },
  notFound: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    status: 404,
  },
  requestAborted: {
    code: 'REQUEST_ABORTED',
    message: 'Request aborted',
    status: 499,
  },
} as const
