/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DEFAULT_SSE_HEARTBEAT_SECONDS } from '@adatechnology/notification-module'

import { createRequestHandler } from '../../src/http/request-handler.service'
import type { HttpRouter } from '../../src/http/router.service'
import {
  IDLE_TIMEOUT_SECONDS,
  JSON_CONTENT_TYPE,
  REQUEST_TIMEOUT_SECONDS,
  SSE_CONTENT_TYPE,
} from '../../src/shared/api.constant'
import type { ApiLogger, RequestTimeoutPort } from '../../src/shared/api.types'

function silentLogger(): ApiLogger {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  } as unknown as ApiLogger
}

type Harness = {
  readonly handle: (request: Request, server: RequestTimeoutPort) => Promise<Response>
  readonly server: RequestTimeoutPort
  readonly timeouts: number[]
}

function createHarness(response: Response): Harness {
  const timeouts: number[] = []
  const router: HttpRouter = {
    allowedMethods: () => ['GET'],
    handle: async () => response,
    logPathname: (pathname) => pathname,
  }

  return {
    handle: createRequestHandler({
      frontendOrigins: ['http://localhost:53000'],
      logger: silentLogger(),
      requestTimeoutSeconds: REQUEST_TIMEOUT_SECONDS,
      router,
    }),
    server: {
      timeout(_request, seconds) {
        timeouts.push(seconds)
      },
    },
    timeouts,
  }
}

function get(): Request {
  return new Request('http://localhost:53001/notifications/stream')
}

describe('contrato de tempo ocioso do SSE', () => {
  /**
   * A falha aqui é silenciosa: o servidor derruba a conexão ociosa e o navegador reconecta sozinho,
   * então ninguém vê erro — só uma tela que pisca e um servidor que reabre stream o tempo todo. Por
   * isso a decisão fica presa a um teste, e não a um número escolhido uma vez.
   */
  test('a janela ociosa cobre o heartbeat do módulo', () => {
    expect(IDLE_TIMEOUT_SECONDS).toBeGreaterThan(DEFAULT_SSE_HEARTBEAT_SECONDS)
  })

  /** Requisição comum continua com a rédea curta: 60s de tolerância é do stream, não de todo mundo. */
  test('a requisição comum mantém os 10 segundos', async () => {
    const harness = createHarness(
      new Response('{}', { headers: { 'content-type': JSON_CONTENT_TYPE } }),
    )

    await harness.handle(get(), harness.server)

    expect(harness.timeouts).toEqual([REQUEST_TIMEOUT_SECONDS])
  })

  /**
   * `server.timeout()` vale por requisição e vence o `idleTimeout` global — subir só a configuração
   * do `Bun.serve` deixaria o stream morrendo nos mesmos 10 segundos.
   */
  test('a resposta de stream ganha a janela longa', async () => {
    const harness = createHarness(
      new Response(new ReadableStream(), { headers: { 'content-type': SSE_CONTENT_TYPE } }),
    )

    await harness.handle(get(), harness.server)

    expect(harness.timeouts.at(-1)).toBe(IDLE_TIMEOUT_SECONDS)
  })
})
