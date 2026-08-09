/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../shared/api.error'
import {
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

/** Método sem corpo pede só o Bearer; os demais carregam JSON e chave de idempotência. */
const BODYLESS_METHODS = new Set([HTTP_GET_METHOD, 'DELETE', 'HEAD'])
const RESOURCE_ALLOW_HEADERS = `${CORS_ALLOW_HEADERS}, Content-Type, Idempotency-Key`

type HandleCorsPreflightParams = {
  readonly frontendOrigin: string
  readonly request: Request
  /** Resolvido só quando é preflight de verdade — o caminho quente não paga a varredura de rotas. */
  readonly resolveAllowedMethods: () => readonly string[]
}

export function handleCorsPreflight({
  frontendOrigin,
  request,
  resolveAllowedMethods,
}: HandleCorsPreflightParams): Response | undefined {
  if (!isCorsPreflight(request)) {
    return undefined
  }

  const requestedMethod = request.headers.get('access-control-request-method')
  if (request.headers.get('origin') !== frontendOrigin || requestedMethod === null) {
    throw new ApiError(HTTP_ERROR.forbidden)
  }

  const allowedMethods = resolveAllowedMethods()
  if (
    !allowedMethods.includes(requestedMethod) ||
    !hasAllowedHeaders({
      requestedHeaders: request.headers.get('access-control-request-headers'),
      requestedMethod,
    })
  ) {
    throw new ApiError(HTTP_ERROR.forbidden)
  }

  return new Response(null, {
    headers: {
      'access-control-allow-headers': allowedHeaders(requestedMethod),
      'access-control-allow-methods': allowedMethods.join(', '),
      'access-control-allow-origin': frontendOrigin,
      'access-control-max-age': String(CORS_MAX_AGE_SECONDS),
    },
    status: 204,
  })
}

function allowedHeaders(requestedMethod: string): string {
  return BODYLESS_METHODS.has(requestedMethod) ? CORS_ALLOW_HEADERS : RESOURCE_ALLOW_HEADERS
}

type HasAllowedHeadersParams = {
  readonly requestedHeaders: string | null
  readonly requestedMethod: string
}

/**
 * Subconjunto, não igualdade: upload multipart pede `Authorization, Idempotency-Key` e um GET sem
 * cabeçalho custom pede lista vazia. Exigir a lista exata transformava cada formato em exceção.
 */
function hasAllowedHeaders({
  requestedHeaders,
  requestedMethod,
}: HasAllowedHeadersParams): boolean {
  const allowed = new Set(
    allowedHeaders(requestedMethod)
      .toLowerCase()
      .split(',')
      .map((header) => header.trim()),
  )
  return parseHeaderList(requestedHeaders).every((header) => allowed.has(header))
}

function parseHeaderList(value: string | null): readonly string[] {
  return (value ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0)
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
