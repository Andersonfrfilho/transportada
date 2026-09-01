/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo } from '../logging/safe-logger.service'
import {
  API_AUTH_ME_PATH,
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  CORRELATION_ID_HEADER,
  HTTP_ERROR,
  IDLE_TIMEOUT_SECONDS,
  SSE_CONTENT_TYPE,
} from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { ApiLogger, RequestTimeoutPort } from '../shared/api.types'
import { applyCorsHeaders, handleCorsPreflight } from './cors.service'
import type { HttpRouter } from './router.service'
import { isNoStorePath } from './request-path.service'
import { parseCorrelationId, parseRequestMetadata } from './request.schema'
import { createErrorResponse, createServerErrorHandler } from './response.service'

type CreateRequestHandlerParams = {
  readonly captureError?: (error: unknown) => void
  readonly createCorrelationId?: () => string
  readonly frontendOrigins: readonly [string, ...string[]]
  readonly logger: ApiLogger
  readonly requestTimeoutSeconds: number
  readonly router: HttpRouter
}

export function createRequestHandler({
  captureError = () => undefined,
  createCorrelationId = () => crypto.randomUUID(),
  frontendOrigins,
  logger,
  requestTimeoutSeconds,
  router,
}: CreateRequestHandlerParams) {
  const dependencies = {
    captureError,
    createCorrelationId,
    frontendOrigins,
    logger,
    requestTimeoutSeconds,
    router,
  }
  return (request: Request, server: RequestTimeoutPort): Promise<Response> =>
    handleRequest({ dependencies, request, server })
}

type RequestHandlerDependencies = Required<CreateRequestHandlerParams>

type HandleRequestParams = {
  readonly dependencies: RequestHandlerDependencies
  readonly request: Request
  readonly server: RequestTimeoutPort
}

async function handleRequest({
  dependencies,
  request,
  server,
}: HandleRequestParams): Promise<Response> {
  const startedAt = performance.now()
  const requestPathname = new URL(request.url).pathname
  const correlationId = resolveCorrelationId({
    createCorrelationId: dependencies.createCorrelationId,
    value: request.headers.get(CORRELATION_ID_HEADER),
  })

  let response: Response
  try {
    response = await executeRequest({
      correlationId,
      dependencies,
      request,
      requestPathname,
      server,
    })
  } catch (error: unknown) {
    response = createErrorResponse({
      captureError: dependencies.captureError,
      correlationId,
      error,
      logger: dependencies.logger,
    })
  }

  if (isNoStorePath(requestPathname)) {
    response.headers.set('cache-control', 'no-store')
  }
  applyCorsHeaders({ frontendOrigins: dependencies.frontendOrigins, request, response })
  response.headers.set(CORRELATION_ID_HEADER, correlationId)
  logRequestCompletion({
    correlationId,
    logger: dependencies.logger,
    pathname: dependencies.router.logPathname(requestPathname),
    request,
    response,
    startedAt,
  })
  return response
}

type ExecuteRequestParams = {
  readonly correlationId: string
  readonly dependencies: RequestHandlerDependencies
  readonly request: Request
  readonly requestPathname: string
  readonly server: RequestTimeoutPort
}

async function executeRequest({
  correlationId,
  dependencies,
  request,
  requestPathname,
  server,
}: ExecuteRequestParams): Promise<Response> {
  const metadata = parseRequestMetadata({
    contentLength: request.headers.get('content-length') ?? undefined,
    method: request.method,
    pathname: requestPathname,
  })
  server.timeout(request, dependencies.requestTimeoutSeconds)
  assertRequestSize(metadata.contentLength)
  assertRequestActive(request.signal)
  const response =
    handleCorsPreflight({
      frontendOrigins: dependencies.frontendOrigins,
      request,
      resolveAllowedMethods: () => dependencies.router.allowedMethods(metadata.pathname),
    }) ??
    (await dependencies.router.handle({
      correlationId,
      method: metadata.method,
      pathname: metadata.pathname,
      request,
    }))
  assertRequestActive(request.signal)
  // `server.timeout()` vale por requisição e vence o `idleTimeout` do `Bun.serve`: sem soltar a
  // rédea aqui, o stream morreria nos mesmos 10 segundos da requisição comum.
  if (isEventStream(response)) server.timeout(request, IDLE_TIMEOUT_SECONDS)
  return response
}

export { createServerErrorHandler }

function isEventStream(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').startsWith(SSE_CONTENT_TYPE)
}

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
