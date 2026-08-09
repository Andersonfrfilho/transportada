/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CORRELATION_ID_HEADER, HTTP_ERROR, JSON_CONTENT_TYPE } from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { ApiLogger, ErrorResponse } from '../shared/api.types'
import { describeErrorForLog } from '../logging/error-descriptor.service'
import { safeLogError } from '../logging/safe-logger.service'

type ErrorResponseParams = {
  /** Só o desconhecido interessa: 4xx de domínio é resposta esperada, não incidente. */
  readonly captureError?: (error: unknown) => void
  readonly correlationId: string
  readonly error: unknown
  readonly logger: ApiLogger
}

export function createErrorResponse({
  captureError,
  correlationId,
  error,
  logger,
}: ErrorResponseParams): Response {
  if (error instanceof ApiError) {
    return jsonResponse({
      body: {
        error: { code: error.code, correlationId, message: error.message },
      },
      ...(error.headers ? { headers: error.headers } : {}),
      status: error.status,
    })
  }

  safeLogError({
    logger,
    message: 'http_request_failed',
    metadata: { correlationId, ...describeErrorForLog(error) },
  })
  captureError?.(error)
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
    safeLogError({ logger, message: 'http_server_error', metadata: { correlationId } })
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
  readonly body: ErrorResponse
  readonly headers?: Readonly<Record<string, string>>
  readonly status: number
}

function jsonResponse({ body, headers, status }: JsonResponseParams): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': JSON_CONTENT_TYPE, ...headers },
    status,
  })
}
