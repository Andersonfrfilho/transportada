/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../shared/api.error'
import {
  API_AUTH_ME_PATH,
  API_LIVE_PATH,
  API_READY_PATH,
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  CORRELATION_ID_HEADER,
  HTTP_ERROR,
  HTTP_GET_METHOD,
  INVALID_LOG_PATHNAME,
  JSON_CONTENT_TYPE,
  UNMATCHED_LOG_PATHNAME,
} from '../shared/api.constant'
import type {
  ApiLogger,
  AuthMeResponse,
  ErrorResponse,
  HealthResponse,
  RequestTimeoutPort,
} from '../shared/api.types'
import type { HealthService } from '../health/health.service'
import type { AuthenticationPort } from '../identity/application/identity.port'
import type { TenantContextService } from '../identity/application/tenant-context.service'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service'
import { parseCorrelationId, parseRequestMetadata } from './request.schema'

type CreateRequestHandlerParams = {
  readonly authentication: AuthenticationPort
  readonly createCorrelationId?: () => string
  readonly healthService: HealthService
  readonly logger: ApiLogger
  readonly requestTimeoutSeconds: number
  readonly tenantContext: TenantContextService
}

type HandleRouteParams = {
  readonly authentication: AuthenticationPort
  readonly authorizationHeader: string | null
  readonly healthService: HealthService
  readonly method: string
  readonly pathname: string
  readonly tenantContext: TenantContextService
}

export function createRequestHandler({
  authentication,
  createCorrelationId = () => crypto.randomUUID(),
  healthService,
  logger,
  requestTimeoutSeconds,
  tenantContext,
}: CreateRequestHandlerParams) {
  return async (request: Request, server: RequestTimeoutPort): Promise<Response> => {
    const startedAt = performance.now()
    let pathname = INVALID_LOG_PATHNAME
    const correlationId = resolveCorrelationId({
      createCorrelationId,
      value: request.headers.get(CORRELATION_ID_HEADER),
    })

    let response: Response
    try {
      const metadata = parseRequestMetadata({
        contentLength: request.headers.get('content-length') ?? undefined,
        method: request.method,
        pathname: new URL(request.url).pathname,
      })
      pathname = resolveLogPathname(metadata.pathname)
      server.timeout(request, requestTimeoutSeconds)
      if (
        metadata.contentLength !== undefined &&
        metadata.contentLength > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES
      ) {
        throw new ApiError(HTTP_ERROR.payloadTooLarge)
      }
      assertRequestActive(request.signal)
      response = await handleRoute({
        authentication,
        authorizationHeader: request.headers.get('authorization'),
        healthService,
        method: metadata.method,
        pathname: metadata.pathname,
        tenantContext,
      })
      assertRequestActive(request.signal)
    } catch (error: unknown) {
      response = errorResponse({ correlationId, error, logger })
    }

    if (pathname === API_AUTH_ME_PATH) {
      response.headers.set('cache-control', 'no-store')
    }
    response.headers.set(CORRELATION_ID_HEADER, correlationId)
    logRequestCompletion({ correlationId, logger, pathname, request, response, startedAt })

    return response
  }
}

async function handleRoute({
  authentication,
  authorizationHeader,
  healthService,
  method,
  pathname,
  tenantContext,
}: HandleRouteParams): Promise<Response> {
  if (pathname === API_LIVE_PATH || pathname === API_READY_PATH) {
    if (method !== HTTP_GET_METHOD) {
      throw new ApiError({
        ...HTTP_ERROR.methodNotAllowed,
        headers: { allow: HTTP_GET_METHOD },
      })
    }

    if (pathname === API_LIVE_PATH) {
      return jsonResponse({ body: healthService.live(), status: 200 })
    }

    const readiness = await healthService.ready()
    return jsonResponse({
      body: readiness,
      status: readiness.status === 'ok' ? 200 : 503,
    })
  }

  const identity = await authentication.authenticate(authorizationHeader)
  if (pathname === API_AUTH_ME_PATH) {
    if (method !== HTTP_GET_METHOD) {
      throw new ApiError({
        ...HTTP_ERROR.methodNotAllowed,
        headers: { allow: HTTP_GET_METHOD },
      })
    }

    const context = await tenantContext.resolveCompany(identity)
    return jsonResponse({
      body: {
        data: {
          company: { id: context.scope.companyId },
          identity: { userId: context.identity.userId },
          permissions: [...context.scope.permissions],
          roles: [...context.scope.roles],
        },
      },
      status: 200,
    })
  }

  throw new ApiError(HTTP_ERROR.notFound)
}

type LogRequestCompletionParams = {
  readonly correlationId: string
  readonly logger: ApiLogger
  readonly pathname: string
  readonly request: Request
  readonly response: Response
  readonly startedAt: number
}

function logRequestCompletion({
  correlationId,
  logger,
  pathname,
  request,
  response,
  startedAt,
}: LogRequestCompletionParams): void {
  if (pathname === API_AUTH_ME_PATH) {
    safeLogInfo({
      logger,
      message: 'auth_me_request_completed',
      metadata: { correlationId, status: response.status },
    })
    return
  }

  safeLogInfo({
    logger,
    message: 'http_request_completed',
    metadata: {
      correlationId,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      method: request.method,
      pathname,
      status: response.status,
    },
  })
}

type ResolveCorrelationIdParams = {
  readonly createCorrelationId: () => string
  readonly value: string | null
}

function resolveCorrelationId({ createCorrelationId, value }: ResolveCorrelationIdParams): string {
  return parseCorrelationId(value) ?? createCorrelationId()
}

function resolveLogPathname(pathname: string): string {
  return pathname === API_LIVE_PATH || pathname === API_READY_PATH || pathname === API_AUTH_ME_PATH
    ? pathname
    : UNMATCHED_LOG_PATHNAME
}

function assertRequestActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ApiError(HTTP_ERROR.requestAborted)
  }
}

type ErrorResponseParams = {
  readonly correlationId: string
  readonly error: unknown
  readonly logger: ApiLogger
}

function errorResponse({ correlationId, error, logger }: ErrorResponseParams): Response {
  if (error instanceof ApiError) {
    return jsonResponse({
      body: {
        error: {
          code: error.code,
          correlationId,
          message: error.message,
        },
      },
      headers: error.headers,
      status: error.status,
    })
  }

  safeLogError({
    logger,
    message: 'http_request_failed',
    metadata: { correlationId },
  })
  return jsonResponse({
    body: {
      error: {
        code: HTTP_ERROR.internal.code,
        correlationId,
        message: HTTP_ERROR.internal.message,
      },
    },
    status: HTTP_ERROR.internal.status,
  })
}

type CreateServerErrorHandlerParams = {
  readonly createCorrelationId?: () => string
  readonly logger: ApiLogger
}

export function createServerErrorHandler({
  createCorrelationId = () => crypto.randomUUID(),
  logger,
}: CreateServerErrorHandlerParams): () => Response {
  return (): Response => {
    const correlationId = createCorrelationId()
    safeLogError({
      logger,
      message: 'http_server_error',
      metadata: { correlationId },
    })
    const response = jsonResponse({
      body: {
        error: {
          code: HTTP_ERROR.internal.code,
          correlationId,
          message: HTTP_ERROR.internal.message,
        },
      },
      status: HTTP_ERROR.internal.status,
    })
    response.headers.set(CORRELATION_ID_HEADER, correlationId)
    return response
  }
}

type JsonResponseParams = {
  readonly body: AuthMeResponse | ErrorResponse | HealthResponse
  readonly headers?: Readonly<Record<string, string>>
  readonly status: number
}

function jsonResponse({ body, headers, status }: JsonResponseParams): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': JSON_CONTENT_TYPE,
      ...headers,
    },
    status,
  })
}
