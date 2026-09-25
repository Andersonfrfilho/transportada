/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createErrorResponse } from '../../src/http/response.service.js'
import { invalidRequest } from '../../src/http/request-parsing.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import { HTTP_ERROR } from '../../src/shared/api.constant.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const CORRELATION_ID = 'c7e2a9b1-33d4-4f55-8a66-b1c2d3e4f5a6'
const CPF = '52998224725'

type LogEntry = { readonly message: string; readonly metadata: unknown }

function recordingLogger(): ApiLogger & { readonly entries: LogEntry[] } {
  const entries: LogEntry[] = []
  const record = (message: string, metadata?: Record<string, unknown>): void => {
    entries.push({ message, metadata })
  }
  return { entries, error: record, info: record, warn: record }
}

/**
 * Um 400 só dizia o status no log: em 24/09/2026 a ficha do motorista foi recusada em staging e
 * ninguém soube por qual campo. O nome do campo vai para o log; o valor e a mensagem, nunca.
 */
describe('rejected request fields in the log', () => {
  test('logs the names of the fields a 400 refused', () => {
    const logger = recordingLogger()

    createErrorResponse({
      correlationId: CORRELATION_ID,
      error: invalidRequest([
        { field: 'linkedAddress.state', message: 'Invalid' },
        { field: 'taxId', message: `CPF ${CPF} inválido` },
      ]),
      logger,
    })

    expect(logger.entries).toEqual([
      {
        message: 'http_request_rejected',
        metadata: {
          correlationId: CORRELATION_ID,
          fields: ['linkedAddress.state', 'taxId'],
        },
      },
    ])
  })

  test('never carries the rejection message, which can quote what was typed', () => {
    const logger = recordingLogger()

    createErrorResponse({
      correlationId: CORRELATION_ID,
      error: invalidRequest([{ field: 'taxId', message: `CPF ${CPF} inválido` }]),
      logger,
    })

    expect(JSON.stringify(logger.entries)).not.toContain(CPF)
  })

  test('stays quiet for a domain error without field details', () => {
    const logger = recordingLogger()

    createErrorResponse({
      correlationId: CORRELATION_ID,
      error: new ApiError(HTTP_ERROR.notFound),
      logger,
    })

    expect(logger.entries).toHaveLength(0)
  })
})
