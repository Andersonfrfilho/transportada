import { randomUUID } from 'node:crypto'
import pino, { type Logger } from 'pino'
import type { NextFunction, Request, Response } from 'express'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

const unsafeCorrelationId = /[^a-zA-Z0-9._:-]/g

export function normalizeCorrelationId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    return randomUUID()
  }

  const normalized = value.replace(unsafeCorrelationId, '')
  return normalized.length > 0 ? normalized : randomUUID()
}

export function createLogger(
  name: string,
  level: string,
  destination?: pino.DestinationStream,
): Logger {
  return pino(
    {
      name,
      level,
      base: undefined,
      redact: {
        paths: [
          'password',
          '*.password',
          'certificate',
          '*.certificate',
          'authorization',
          'req.headers.authorization',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  )
}

export function correlationIdMiddleware(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const correlationId = normalizeCorrelationId(request.header(CORRELATION_ID_HEADER))
    response.setHeader(CORRELATION_ID_HEADER, correlationId)
    response.locals.correlationId = correlationId

    const startedAt = performance.now()
    response.on('finish', () => {
      logger.info(
        {
          correlationId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
        'http_request_completed',
      )
    })

    next()
  }
}
