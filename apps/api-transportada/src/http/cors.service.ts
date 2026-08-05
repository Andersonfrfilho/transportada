/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../shared/api.error'
import { hasResourcePreflightHeaders } from './cors-policy.service'
import {
  API_AUTH_ME_PATH,
  API_AUDIT_EVENTS_PATH,
  API_BILLING_ELIGIBLE_CTES_PATH,
  API_BOOTSTRAP_FIRST_ADMIN_PATH,
  API_BILLING_INVOICE_PREVIEW_PATH,
  API_BILLING_INVOICES_PATH,
  API_COMPANY_SETTINGS_CNPJ_LOOKUP_PATH,
  API_COMPANY_SETTINGS_LOGO_PATH,
  API_COMPANY_SETTINGS_PATH,
  API_CTE_BATCHES_PATH,
  API_DIGITAL_CERTIFICATES_PATH,
  API_FLEET_CAPABILITIES_PATH,
  API_FLEET_DRIVERS_PATH,
  API_FLEET_VEHICLE_LOOKUP_PATH,
  API_FLEET_VEHICLES_PATH,
  API_FREIGHT_CALCULATIONS_PATH,
  API_FREIGHT_RULES_PATH,
  API_NFE_DOCUMENTS_PATH,
  API_NFE_IMPORTS_DISTRIBUTION_PATH,
  API_NFE_IMPORTS_PATH,
  API_NFE_IMPORTS_XML_PATH,
  API_OPERATIONS_JOBS_PATH,
  API_OPERATIONS_SUMMARY_PATH,
  API_OPERATIONS_TIMELINE_PATH,
  CORS_ALLOW_HEADERS,
  CORS_MAX_AGE_SECONDS,
  HTTP_ERROR,
  HTTP_GET_METHOD,
  HTTP_OPTIONS_METHOD,
} from '../shared/api.constant'

const FLEET_VEHICLES_SUFFIX = '/vehicles'

const CORS_REQUEST_HEADERS = [
  'Origin',
  'Access-Control-Request-Method',
  'Access-Control-Request-Headers',
] as const

type HandleCorsPreflightParams = {
  readonly frontendOrigin: string
  readonly pathname: string
  readonly request: Request
}

export function handleCorsPreflight({
  frontendOrigin,
  pathname,
  request,
}: HandleCorsPreflightParams): Response | undefined {
  if (!isCorsPreflight(request)) {
    return undefined
  }

  if (!isAllowedPreflight({ frontendOrigin, pathname, request })) {
    throw new ApiError(HTTP_ERROR.forbidden)
  }

  return new Response(null, {
    headers: {
      'access-control-allow-headers': allowedHeaders(pathname),
      'access-control-allow-methods': allowedMethods(pathname),
      'access-control-allow-origin': frontendOrigin,
      'access-control-max-age': String(CORS_MAX_AGE_SECONDS),
    },
    status: 204,
  })
}

function allowedHeaders(pathname: string): string {
  if (pathname === API_BOOTSTRAP_FIRST_ADMIN_PATH) return 'Authorization, Content-Type'
  if (isCteBatchItemPath(pathname)) return 'Authorization'

  return requiresResourceHeaders(pathname)
    ? 'Authorization, Content-Type, Idempotency-Key'
    : CORS_ALLOW_HEADERS
}

/**
 * Remover item de lote é DELETE sem corpo, então só o Bearer é liberado. Sub-recursos do item
 * (`/reprocess`, `/cancel`) são POST com corpo e chave de idempotência — não casam aqui.
 */
function isCteBatchItemPath(pathname: string): boolean {
  if (!pathname.startsWith(`${API_CTE_BATCHES_PATH}/`)) return false

  const itemSegment = pathname.split('/items/')[1]
  return itemSegment !== undefined && itemSegment.length > 0 && !itemSegment.includes('/')
}

/**
 * Editar a fatura é PATCH no recurso em si; `preview` e os sub-recursos (`/documents`, `/cancel`)
 * continuam fora da fronteira de edição.
 */
function isBillingInvoiceResourcePath(pathname: string): boolean {
  const segment = pathname.slice(`${API_BILLING_INVOICES_PATH}/`.length)
  return (
    pathname.startsWith(`${API_BILLING_INVOICES_PATH}/`) &&
    segment.length > 0 &&
    !segment.includes('/') &&
    `${API_BILLING_INVOICES_PATH}/${segment}` !== API_BILLING_INVOICE_PREVIEW_PATH
  )
}

function allowedMethods(pathname: string): string {
  if (pathname === API_BOOTSTRAP_FIRST_ADMIN_PATH) return 'POST'
  if (pathname === API_COMPANY_SETTINGS_LOGO_PATH) return 'GET, PUT, DELETE'
  if (isCteBatchItemPath(pathname)) return 'DELETE'
  if (isBillingInvoiceResourcePath(pathname)) return 'GET, PATCH'
  if (isFleetDriverVehiclesPath(pathname)) return 'GET, PUT'
  if (isFleetCollectionPath(pathname)) return 'GET, POST'
  if (isFleetResourcePath(pathname)) return 'GET, PATCH'
  if (pathname === API_COMPANY_SETTINGS_PATH) return 'GET, PATCH'
  if (pathname === API_DIGITAL_CERTIFICATES_PATH) return 'GET, POST, DELETE'
  if (pathname === API_FREIGHT_RULES_PATH) return 'GET, POST'
  if (pathname === API_FREIGHT_CALCULATIONS_PATH) return 'GET, POST'
  if (pathname === API_CTE_BATCHES_PATH) return 'GET, POST'
  if (pathname === API_BILLING_INVOICES_PATH) return 'GET, POST'
  if (
    pathname === API_NFE_IMPORTS_XML_PATH ||
    pathname === API_NFE_IMPORTS_DISTRIBUTION_PATH ||
    pathname.endsWith('/reprocess') ||
    pathname.endsWith('/submit') ||
    pathname.endsWith('/cancel')
  ) {
    return 'POST'
  }
  return HTTP_GET_METHOD
}

type ApplyCorsHeadersParams = {
  readonly frontendOrigin: string
  readonly request: Request
  readonly response: Response
}

export function applyCorsHeaders({
  frontendOrigin,
  request,
  response,
}: ApplyCorsHeadersParams): void {
  const isPreflight = isCorsPreflight(request)
  appendVary({
    headers: response.headers,
    values: isPreflight ? CORS_REQUEST_HEADERS : ['Origin'],
  })

  if (!isPreflight && request.headers.get('origin') === frontendOrigin) {
    response.headers.set('access-control-allow-origin', frontendOrigin)
  }
}

function isCorsPreflight(request: Request): boolean {
  if (request.method !== HTTP_OPTIONS_METHOD) {
    return false
  }

  return CORS_REQUEST_HEADERS.some((header) => request.headers.has(header))
}

type IsAllowedPreflightParams = HandleCorsPreflightParams

function isAllowedPreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  return (
    isAuthMePreflight({ frontendOrigin, pathname, request }) ||
    isBootstrapPreflight({ frontendOrigin, pathname, request }) ||
    isCompanySettingsPreflight({ frontendOrigin, pathname, request }) ||
    isCompanyLogoPreflight({ frontendOrigin, pathname, request }) ||
    isDigitalCertificatesPreflight({ frontendOrigin, pathname, request }) ||
    isWorkspaceResourcePreflight({ frontendOrigin, pathname, request })
  )
}

/** Rota anônima do ADR-0022 — sem `Idempotency-Key`, o arranque não é um POST repetível. */
function isBootstrapPreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  return (
    pathname === API_BOOTSTRAP_FIRST_ADMIN_PATH &&
    request.headers.get('origin') === frontendOrigin &&
    request.headers.get('access-control-request-method') === 'POST' &&
    hasOnlyBootstrapHeaders(request.headers.get('access-control-request-headers'))
  )
}

function hasOnlyBootstrapHeaders(value: string | null): boolean {
  if (value === null) return false

  const requestedHeaders = value.split(',').map((header) => header.trim().toLowerCase())
  const expectedHeaders = new Set(['authorization', 'content-type'])
  return (
    requestedHeaders.length === expectedHeaders.size &&
    new Set(requestedHeaders).size === requestedHeaders.length &&
    requestedHeaders.every((header) => expectedHeaders.has(header))
  )
}

function isWorkspaceResourcePreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  const requestedMethod = request.headers.get('access-control-request-method')
  if (request.headers.get('origin') !== frontendOrigin || requestedMethod === null) {
    return false
  }

  if (isAuthorizationOnlyPath(pathname) && requestedMethod === HTTP_GET_METHOD) {
    return hasOnlyAuthorizationHeader(request.headers.get('access-control-request-headers'))
  }

  if (!requiresResourceHeaders(pathname)) {
    return false
  }

  return (
    (requestedMethod === HTTP_GET_METHOD ||
      (requestedMethod === 'POST' && !isFleetResourcePath(pathname)) ||
      (requestedMethod === 'PATCH' &&
        (isBillingInvoiceResourcePath(pathname) || isFleetResourcePath(pathname))) ||
      (requestedMethod === 'PUT' && isFleetDriverVehiclesPath(pathname)) ||
      (requestedMethod === 'DELETE' && isCteBatchItemPath(pathname))) &&
    hasResourcePreflightHeaders({
      method: requestedMethod,
      value: request.headers.get('access-control-request-headers'),
    })
  )
}

/**
 * O logo sobe como `multipart/form-data`, que é content-type safelisted no CORS: o navegador
 * pede só `Authorization` no preflight, então a tripla de headers de recurso não se aplica aqui.
 */
function isCompanyLogoPreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  const requestedMethod = request.headers.get('access-control-request-method')
  return (
    pathname === API_COMPANY_SETTINGS_LOGO_PATH &&
    request.headers.get('origin') === frontendOrigin &&
    (requestedMethod === HTTP_GET_METHOD ||
      requestedMethod === 'PUT' ||
      requestedMethod === 'DELETE') &&
    hasOnlyAuthorizationHeader(request.headers.get('access-control-request-headers'))
  )
}

function isDigitalCertificatesPreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  const requestedMethod = request.headers.get('access-control-request-method')
  return (
    pathname === API_DIGITAL_CERTIFICATES_PATH &&
    request.headers.get('origin') === frontendOrigin &&
    (requestedMethod === HTTP_GET_METHOD ||
      requestedMethod === 'POST' ||
      requestedMethod === 'DELETE') &&
    hasResourcePreflightHeaders({
      method: requestedMethod,
      value: request.headers.get('access-control-request-headers'),
    })
  )
}

function isAuthMePreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  return (
    pathname === API_AUTH_ME_PATH &&
    request.headers.get('origin') === frontendOrigin &&
    request.headers.get('access-control-request-method') === HTTP_GET_METHOD &&
    hasOnlyAuthorizationHeader(request.headers.get('access-control-request-headers'))
  )
}

function isCompanySettingsPreflight({
  frontendOrigin,
  pathname,
  request,
}: IsAllowedPreflightParams): boolean {
  const requestedMethod = request.headers.get('access-control-request-method')
  return (
    pathname === API_COMPANY_SETTINGS_PATH &&
    request.headers.get('origin') === frontendOrigin &&
    (requestedMethod === HTTP_GET_METHOD || requestedMethod === 'PATCH') &&
    hasResourcePreflightHeaders({
      method: requestedMethod,
      value: request.headers.get('access-control-request-headers'),
    })
  )
}

function hasOnlyAuthorizationHeader(value: string | null): boolean {
  if (value === null) {
    return false
  }

  const requestedHeaders = value.split(',').map((header) => header.trim().toLowerCase())
  return (
    requestedHeaders.length > 0 &&
    requestedHeaders.every((header) => header === CORS_ALLOW_HEADERS.toLowerCase())
  )
}

function isAuthorizationOnlyPath(pathname: string): boolean {
  return (
    pathname === API_AUTH_ME_PATH ||
    pathname === API_COMPANY_SETTINGS_CNPJ_LOOKUP_PATH ||
    pathname === API_NFE_IMPORTS_PATH ||
    pathname.startsWith(`${API_NFE_IMPORTS_PATH}/`) ||
    pathname === API_NFE_DOCUMENTS_PATH ||
    pathname.startsWith(`${API_NFE_DOCUMENTS_PATH}/`) ||
    pathname === API_BILLING_ELIGIBLE_CTES_PATH ||
    pathname === API_OPERATIONS_SUMMARY_PATH ||
    pathname === API_OPERATIONS_TIMELINE_PATH ||
    pathname === API_OPERATIONS_JOBS_PATH ||
    pathname === API_AUDIT_EVENTS_PATH ||
    pathname === API_FLEET_VEHICLE_LOOKUP_PATH ||
    pathname === API_FLEET_CAPABILITIES_PATH
  )
}

function isFleetCollectionPath(pathname: string): boolean {
  return pathname === API_FLEET_VEHICLES_PATH || pathname === API_FLEET_DRIVERS_PATH
}

/** `/fleet/drivers/:id/vehicles` é o conjunto de vínculos, trocado inteiro num PUT. */
function isFleetDriverVehiclesPath(pathname: string): boolean {
  const segment = fleetSegment(API_FLEET_DRIVERS_PATH, pathname)
  const driverId = segment.endsWith(FLEET_VEHICLES_SUFFIX)
    ? segment.slice(0, -FLEET_VEHICLES_SUFFIX.length)
    : ''
  return driverId.length > 0 && !driverId.includes('/')
}

function isFleetResourcePath(pathname: string): boolean {
  // `/fleet/vehicles/lookup` é consulta por placa, não um veículo cadastrado
  if (pathname === API_FLEET_VEHICLE_LOOKUP_PATH) return false

  return [API_FLEET_VEHICLES_PATH, API_FLEET_DRIVERS_PATH].some((collection) => {
    const segment = fleetSegment(collection, pathname)
    return segment.length > 0 && !segment.includes('/')
  })
}

function fleetSegment(collection: string, pathname: string): string {
  return pathname.startsWith(`${collection}/`) ? pathname.slice(`${collection}/`.length) : ''
}

function requiresResourceHeaders(pathname: string): boolean {
  return (
    isFleetCollectionPath(pathname) ||
    isFleetResourcePath(pathname) ||
    isFleetDriverVehiclesPath(pathname) ||
    pathname === API_COMPANY_SETTINGS_PATH ||
    pathname === API_DIGITAL_CERTIFICATES_PATH ||
    pathname === API_FREIGHT_RULES_PATH ||
    pathname === API_FREIGHT_CALCULATIONS_PATH ||
    pathname === API_CTE_BATCHES_PATH ||
    pathname.startsWith(`${API_CTE_BATCHES_PATH}/`) ||
    pathname === API_BILLING_INVOICES_PATH ||
    pathname.startsWith(`${API_BILLING_INVOICES_PATH}/`) ||
    pathname === API_NFE_IMPORTS_XML_PATH ||
    pathname === API_NFE_IMPORTS_DISTRIBUTION_PATH ||
    pathname.endsWith('/reprocess')
  )
}

type AppendVaryParams = {
  readonly headers: Headers
  readonly values: readonly string[]
}

function appendVary({ headers, values }: AppendVaryParams): void {
  const varyValues = new Map<string, string>()
  for (const value of headers.get('vary')?.split(',') ?? []) {
    const trimmedValue = value.trim()
    if (trimmedValue) {
      varyValues.set(trimmedValue.toLowerCase(), trimmedValue)
    }
  }
  for (const value of values) {
    varyValues.set(value.toLowerCase(), value)
  }
  headers.set('vary', [...varyValues.values()].join(', '))
}
