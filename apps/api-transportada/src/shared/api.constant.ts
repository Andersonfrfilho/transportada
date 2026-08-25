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
export const API_COMPANY_SETTINGS_LANDING_PATH = '/company-settings/landing'
export const API_PUBLIC_LANDING_SETTINGS_PATH = '/public/landing-settings'
export const API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH =
  '/company-settings/scheduled-distribution'
export const API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH = '/company-settings/distribution-cursor'
export const API_COMPANY_SETTINGS_FUEL_PRICES_PATH = '/company-settings/fuel-prices'
export const API_COMPANY_SETTINGS_ENERGY_PATH = '/company-settings/energy'
export const API_DIGITAL_CERTIFICATES_PATH = '/digital-certificates'
export const API_FREIGHT_RULES_PATH = '/freight-rules'
export const API_FREIGHT_CALCULATIONS_PATH = '/freight-calculations'
export const API_FREIGHT_REGIONS_PATH = '/freight-regions'
export const API_FLEET_VEHICLES_PATH = '/fleet/vehicles'
export const API_FLEET_DRIVERS_PATH = '/fleet/drivers'
export const API_FLEET_CAPABILITIES_PATH = '/fleet/capabilities'
export const API_FLEET_VEHICLE_CATALOG_BRANDS_PATH = '/fleet/vehicle-catalog/brands'
export const API_FLEET_VEHICLE_CATALOG_MODELS_PATH = '/fleet/vehicle-catalog/models'
/** Não é rota de frota: os três formulários com campo de CEP — motorista, empresa e MDF-e — a usam. */
export const API_POSTAL_CODES_PATH = '/postal-codes'
export const API_MDFE_MANIFESTS_PATH = '/mdfe-manifests'
export const API_MDFE_MANIFESTS_PREVIEW_PATH = '/mdfe-manifests/preview'
export const API_TRIPS_PATH = '/trips'
export const API_CTE_BATCHES_PATH = '/cte-batches'
export const API_CTE_BATCH_ITEMS_PATH = '/cte-batch-items'
export const API_CTE_BATCH_ITEMS_SUMMARY_PATH = '/cte-batch-items/summary'
export const API_CTE_EMISSION_PROFILES_PATH = '/cte-emission-profiles'
export const API_NFSE_EMISSION_PROFILES_PATH = '/nfse-emission-profiles'
export const API_NFSE_PROVIDER_CREDENTIALS_PATH = '/nfse-provider-credentials'
export const API_NFSE_SERVICE_INVOICES_PATH = '/nfse-service-invoices'
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
export const API_COMPANY_USERS_PATH = '/company-users'
export const API_USER_ACTIVATION_PATH = '/user-activation'
export const API_PASSWORD_RESETS_PATH = '/password-resets'
export const API_PASSWORD_RESET_CONFIRM_PATH = '/password-resets/confirm'
/** Rota anônima: o segmento é segredo, e por isso o caminho fica fora da allowlist de log. */
export const API_PUBLIC_NFSE_CALLBACKS_PATH = '/public/nfse-callbacks/:token'
export const CORRELATION_ID_HEADER = 'x-correlation-id'
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
export const HTTP_GET_METHOD = 'GET'
export const HTTP_OPTIONS_METHOD = 'OPTIONS'
export const CORS_ALLOW_HEADERS = 'Authorization'
export const CORS_MAX_AGE_SECONDS = 300
export const APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = 1_048_576
export const SERVER_MAX_REQUEST_BODY_SIZE_BYTES = 2_097_152
/**
 * Janela ociosa do stream (SSE), não da requisição comum: o heartbeat do módulo de notificações bate
 * a cada 25s, e a conexão precisa sobreviver ao silêncio entre duas batidas.
 */
export const IDLE_TIMEOUT_SECONDS = 60
export const REQUEST_TIMEOUT_SECONDS = 10
export const SSE_CONTENT_TYPE = 'text/event-stream'
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
export const INVALID_LOG_PATHNAME = '<invalid>'
export const UNMATCHED_LOG_PATHNAME = '<unmatched>'
/**
 * Segmento dinâmico de rota (`:vehicleId`). O roteador o usa para casar a requisição, e o log de
 * acesso para nomear a rota que respondeu — duas leituras do mesmo padrão têm de ser uma só, ou o
 * log passa a dizer `<unmatched>` para caminho que o roteador serviu.
 */
export const PATH_PARAMETER_SEGMENT_PATTERN = /^:[A-Za-z][A-Za-z0-9]*$/

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
