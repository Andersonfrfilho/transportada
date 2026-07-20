/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../shared/api.error'
import { hasResourcePreflightHeaders } from './cors-policy.service'
import {
  API_AUTH_ME_PATH,
  API_COMPANY_SETTINGS_PATH,
  API_DIGITAL_CERTIFICATES_PATH,
  CORS_ALLOW_HEADERS,
  CORS_MAX_AGE_SECONDS,
  HTTP_ERROR,
  HTTP_GET_METHOD,
  HTTP_OPTIONS_METHOD,
} from '../shared/api.constant'

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
  return pathname === API_COMPANY_SETTINGS_PATH || pathname === API_DIGITAL_CERTIFICATES_PATH
    ? 'Authorization, Content-Type, Idempotency-Key'
    : CORS_ALLOW_HEADERS
}

function allowedMethods(pathname: string): string {
  if (pathname === API_COMPANY_SETTINGS_PATH) return 'GET, PATCH'
  return pathname === API_DIGITAL_CERTIFICATES_PATH ? 'GET, POST' : HTTP_GET_METHOD
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
    isCompanySettingsPreflight({ frontendOrigin, pathname, request }) ||
    isDigitalCertificatesPreflight({ frontendOrigin, pathname, request })
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
    (requestedMethod === HTTP_GET_METHOD || requestedMethod === 'POST') &&
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
