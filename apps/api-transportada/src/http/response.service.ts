/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import {
  DatabaseQueryAbortedError,
  DatabaseUnavailableError,
  findDatabaseFailure,
} from '../database/database-unavailable.error'
import { CORRELATION_ID_HEADER, HTTP_ERROR, JSON_CONTENT_TYPE } from '../shared/api.constant'
import { ApiError } from '../shared/api.error'
import type { ApiLogger, ErrorResponse } from '../shared/api.types'
import { describeErrorForLog } from '../logging/error-descriptor.service'
import { safeLogError, safeLogWarn } from '../logging/safe-logger.service'

type ErrorResponseParams = {
  /** Só o desconhecido interessa: 4xx de domínio é resposta esperada, não incidente. */
  readonly captureError?: (error: unknown) => void
  readonly correlationId: string
  readonly error: unknown
  readonly logger: ApiLogger
}

type LogRejectedFieldsParams = {
  readonly correlationId: string
  readonly error: ApiError
  readonly logger: ApiLogger
}

/**
 * O 400 de validação diz ao navegador quais campos recusou, e o log só guardava o status. Vai o
 * **nome** do campo; a mensagem fica de fora porque pode citar o que foi digitado.
 */
function logRejectedFields({ correlationId, error, logger }: LogRejectedFieldsParams): void {
  if (error.details === undefined || error.details.length === 0) return
  safeLogWarn({
    logger,
    message: 'http_request_rejected',
    metadata: { correlationId, fields: error.details.map((detail) => detail.field) },
  })
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
  if (
    error instanceof ObjectStorageError &&
    error.code === OBJECT_STORAGE_ERROR_CODES.unavailable
  ) {
    safeLogError({ logger, message: 'object_storage_unavailable', metadata: { correlationId } })
    captureError?.(error)
    return knownErrorResponse({ correlationId, error: HTTP_ERROR.storageUnavailable })
  }
  if (error instanceof ApiError) {
    logRejectedFields({ correlationId, error, logger })
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
