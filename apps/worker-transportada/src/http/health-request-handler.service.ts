/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WorkerHealthService } from '../health/health.service.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type {
  RequestTimeoutPort,
  WorkerHealthResponse,
  WorkerLogger,
} from '../shared/worker.types.js'

const CORRELATION_ID_HEADER = 'x-correlation-id'
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const REQUEST_TIMEOUT_SECONDS = 10

type CreateHealthRequestHandlerParams = {
  readonly createCorrelationId?: () => string
  readonly healthService: WorkerHealthService
  readonly logger: WorkerLogger
}

export function createHealthRequestHandler({
  createCorrelationId = () => crypto.randomUUID(),
  healthService,
  logger,
}: CreateHealthRequestHandlerParams) {
  return async (request: Request, server: RequestTimeoutPort): Promise<Response> => {
    const correlationId = resolveCorrelationId({
      createCorrelationId,
      value: request.headers.get(CORRELATION_ID_HEADER),
    })
    const pathname = safePathname(request.url)
    let response: Response

    try {
      server.timeout(request, REQUEST_TIMEOUT_SECONDS)
      response = await routeHealthRequest({
        correlationId,
        healthService,
        method: request.method,
        pathname,
      })
    } catch {
      safeLogError({
        logger,
        message: 'worker_health_request_failed',
        metadata: { correlationId },
      })
      response = jsonResponse({
        body: {
          error: {
            code: 'INTERNAL_ERROR',
            correlationId,
            message: 'Internal server error',
          },
        },
        status: 500,
      })
    }

    response.headers.set(CORRELATION_ID_HEADER, correlationId)
    safeLogInfo({
      logger,
      message: 'worker_health_request_completed',
      metadata: {
        correlationId,
        method: request.method,
        pathname,
        status: response.status,
      },
    })
    return response
  }
}

type RouteHealthRequestParams = {
  readonly correlationId: string
  readonly healthService: WorkerHealthService
  readonly method: string
  readonly pathname: string
}

async function routeHealthRequest({
  correlationId,
  healthService,
  method,
  pathname,
}: RouteHealthRequestParams): Promise<Response> {
  if (pathname !== '/health/live' && pathname !== '/health/ready') {
    return errorResponse({
      code: 'NOT_FOUND',
      correlationId,
      message: 'Route not found',
      status: 404,
    })
  }
  if (method !== 'GET') {
    return errorResponse({
      code: 'METHOD_NOT_ALLOWED',
      correlationId,
      headers: { allow: 'GET' },
      message: 'Method not allowed',
      status: 405,
    })
  }
  if (pathname === '/health/live') {
    return jsonResponse({ body: healthService.live(), status: 200 })
  }

  const readiness = await healthService.ready()
  return jsonResponse({
    body: readiness,
    status: readiness.status === 'ok' ? 200 : 503,
  })
}

type ErrorResponseParams = {
  readonly code: string
  readonly correlationId: string
  readonly headers?: Readonly<Record<string, string>>
  readonly message: string
  readonly status: number
}

function errorResponse({
  code,
  correlationId,
  headers,
  message,
  status,
}: ErrorResponseParams): Response {
  return jsonResponse({
    body: {
      error: {
        code,
        correlationId,
        message,
      },
    },
    headers,
    status,
  })
}

type JsonResponseParams = {
  readonly body:
    | WorkerHealthResponse
    | {
        readonly error: {
          readonly code: string
          readonly correlationId: string
          readonly message: string
        }
      }
  readonly headers?: Readonly<Record<string, string>>
  readonly status: number
}

function jsonResponse({ body, headers, status }: JsonResponseParams): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    status,
  })
}

function resolveCorrelationId(params: {
  readonly createCorrelationId: () => string
  readonly value: string | null
}): string {
  const candidate = params.value?.trim()
  return candidate && CORRELATION_ID_PATTERN.test(candidate)
    ? candidate
    : params.createCorrelationId()
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return '/'
  }
}
