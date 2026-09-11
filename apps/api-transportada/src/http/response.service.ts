/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DatabaseQueryAbortedError,
  DatabaseUnavailableError,
  findDatabaseFailure,
} from '../database/database-unavailable.error'
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
  const databaseFailure = findDatabaseFailure(error)
  if (databaseFailure instanceof DatabaseQueryAbortedError) {
    return knownErrorResponse({ correlationId, error: HTTP_ERROR.requestAborted })
  }
  if (databaseFailure instanceof DatabaseUnavailableError) {
    safeLogError({
      logger,
      message: 'database_unavailable',
      metadata: { correlationId, reason: databaseFailure.reason },
    })
    captureError?.(databaseFailure)
    return knownErrorResponse({ correlationId, error: HTTP_ERROR.databaseUnavailable })
  }
  if (error instanceof ApiError) {
    return jsonResponse({
      body: {
        error: {
          code: error.code,
          correlationId,
          ...(error.details ? { details: error.details } : {}),
          message: error.message,
        },
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

type KnownErrorResponseParams = {
  readonly correlationId: string
  readonly error: { readonly code: string; readonly message: string; readonly status: number }
}

function knownErrorResponse({ correlationId, error }: KnownErrorResponseParams): Response {
  return jsonResponse({
    body: { error: { code: error.code, correlationId, message: error.message } },
    status: error.status,
  })
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
