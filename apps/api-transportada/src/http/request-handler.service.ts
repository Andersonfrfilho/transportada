/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo } from '../logging/safe-logger.service'
import {
  API_AUTH_ME_PATH,
  API_LIVE_PATH,
  API_READY_PATH,
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  CORRELATION_ID_HEADER,
  HTTP_ERROR,
  INVALID_LOG_PATHNAME,
  UNMATCHED_LOG_PATHNAME,
} from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { ApiLogger, RequestTimeoutPort } from '../shared/api.types'
import { applyCorsHeaders, handleCorsPreflight } from './cors.service'
import type { HttpRouter } from './router.service'
import { parseCorrelationId, parseRequestMetadata } from './request.schema'
import { createErrorResponse, createServerErrorHandler } from './response.service'

type CreateRequestHandlerParams = {
  readonly createCorrelationId?: () => string
  readonly frontendOrigin: string
  readonly logger: ApiLogger
  readonly requestTimeoutSeconds: number
  readonly router: HttpRouter
}

export function createRequestHandler({
  createCorrelationId = () => crypto.randomUUID(),
  frontendOrigin,
  logger,
  requestTimeoutSeconds,
  router,
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
      assertRequestSize(metadata.contentLength)
      assertRequestActive(request.signal)
      response =
        handleCorsPreflight({ frontendOrigin, pathname: metadata.pathname, request }) ??
        (await router.handle({
          method: metadata.method,
          pathname: metadata.pathname,
          request,
        }))
      assertRequestActive(request.signal)
    } catch (error: unknown) {
      response = createErrorResponse({ correlationId, error, logger })
    }

    if (pathname === API_AUTH_ME_PATH) {
      response.headers.set('cache-control', 'no-store')
    }
    applyCorsHeaders({ frontendOrigin, request, response })
    response.headers.set(CORRELATION_ID_HEADER, correlationId)
    logRequestCompletion({ correlationId, logger, pathname, request, response, startedAt })
    return response
  }
}

export { createServerErrorHandler }

function assertRequestSize(contentLength: number | undefined): void {
  if (contentLength !== undefined && contentLength > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES) {
    throw new ApiError(HTTP_ERROR.payloadTooLarge)
  }
}

function assertRequestActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ApiError(HTTP_ERROR.requestAborted)
  }
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
  return pathname === API_AUTH_ME_PATH || pathname === API_LIVE_PATH || pathname === API_READY_PATH
    ? pathname
    : UNMATCHED_LOG_PATHNAME
}
