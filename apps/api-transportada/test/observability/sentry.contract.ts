/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createErrorResponse } from '../../src/http/response.service.js'
import {
  createErrorTracker,
  type SentryClientPort,
  type SentryInitOptions,
} from '../../src/observability/sentry.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import { HTTP_ERROR } from '../../src/shared/api.constant.js'

const CPF = '52998224725'
const CNPJ = '12.345.678/0001-95'
const EMAIL = 'motorista@transportadora.com.br'
const PHONE = '(11) 98765-4321'
const ACCESS_KEY = '35240612345678000195570010000012341000012347'
const SESSION_COOKIE = 'sessao-de-verdade-nao-pode-vazar'
const IP_ADDRESS = '203.0.113.7'
const COMPANY_ID = '9f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'
const CORRELATION_ID = 'c7e2a9b1-33d4-4f55-8a66-b1c2d3e4f5a6'
const DSN = 'https://public@glitchtip.exemplo/42'
const RELEASE = 'api-transportada@0.2.0'

type RecordingClient = {
  readonly captured: unknown[]
  readonly client: SentryClientPort
  readonly flushCalls: number[]
  readonly initCalls: SentryInitOptions[]
}

function createRecordingClient(): RecordingClient {
  const captured: unknown[] = []
  const flushCalls: number[] = []
  const initCalls: SentryInitOptions[] = []

  return {
    captured,
    client: {
      captureException(error: unknown): void {
        captured.push(error)
      },
      async flush(timeoutMilliseconds: number): Promise<void> {
        flushCalls.push(timeoutMilliseconds)
      },
      init(options: SentryInitOptions): void {
        initCalls.push(options)
      },
    },
    flushCalls,
    initCalls,
  }
}

/**
 * Um evento com PII em todo lugar que o SDK sabe preencher, mais os identificadores
 * opacos que precisam sobreviver para o erro ser rastreável.
 */
function createHostileEvent(): Record<string, unknown> {
  return {
    breadcrumbs: [{ category: 'http', data: { telefone: PHONE }, message: `consulta de ${EMAIL}` }],
    contexts: { fiscal: { chaveAcesso: ACCESS_KEY, correlationId: CORRELATION_ID } },
    event_id: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
    exception: {
      values: [{ type: 'NfeImportError', value: `emitente ${CNPJ} recusado, contato ${EMAIL}` }],
    },
    extra: { accessKey: ACCESS_KEY, companyId: COMPANY_ID, cpf: CPF },
    level: 'error',
    message: `falha ao importar para o CPF ${CPF}`,
    request: {
      cookies: { session: SESSION_COOKIE },
      headers: { Authorization: 'Bearer token-de-verdade', 'x-correlation-id': CORRELATION_ID },
      url: `https://api.exemplo/nfe?email=${EMAIL}`,
    },
    tags: { companyId: COMPANY_ID },
    user: { id: COMPANY_ID, ip_address: IP_ADDRESS },
  }
}

function initializeWithDsn(): { readonly options: SentryInitOptions } {
  const { client, initCalls } = createRecordingClient()
  createErrorTracker({
    client,
    configuration: { dsn: DSN, environment: 'staging', release: RELEASE },
  })

  const options = initCalls[0]
  if (options === undefined) throw new Error('init não foi chamado com DSN presente')
  return { options }
}

describe('contrato do rastreio de erro da API — no-op sem DSN', () => {
  test('sem SENTRY_DSN o SDK não é inicializado', () => {
    const { client, initCalls } = createRecordingClient()

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: undefined, environment: 'local', release: RELEASE },
    })

    expect(initCalls).toHaveLength(0)
    expect(tracker.enabled).toBe(false)
  })

  test('DSN em branco é configuração ausente, não DSN inválido', () => {
    const { client, initCalls } = createRecordingClient()

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: '   ', environment: 'local', release: RELEASE },
    })

    expect(initCalls).toHaveLength(0)
    expect(tracker.enabled).toBe(false)
  })

  test('capturar erro sem DSN não lança nem chama o SDK', () => {
    const { captured, client } = createRecordingClient()

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: undefined, environment: 'local', release: RELEASE },
    })

    expect(() => tracker.captureException(new Error('falhou'))).not.toThrow()
    expect(captured).toHaveLength(0)
  })

  test('drenar sem DSN resolve sem chamar o SDK', async () => {
    const { client, flushCalls } = createRecordingClient()

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: undefined, environment: 'local', release: RELEASE },
    })

    await tracker.flush()

    expect(flushCalls).toHaveLength(0)
  })
})

describe('contrato do rastreio de erro da API — opções de privacidade', () => {
  test('nunca envia PII por padrão nem amostra tracing', () => {
    const { options } = initializeWithDsn()

    expect(options.sendDefaultPii).toBe(false)
    expect(options.tracesSampleRate).toBe(0)
  })

  test('com DSN o rastreio fica ligado e o erro chega ao SDK', () => {
    const { captured, client, initCalls } = createRecordingClient()
    const failure = new Error('requisicao falhou')

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: DSN, environment: 'staging', release: RELEASE },
    })
    tracker.captureException(failure)

    expect(initCalls).toHaveLength(1)
    expect(tracker.enabled).toBe(true)
    expect(captured).toEqual([failure])
  })

  test('o desligamento gracioso drena a fila, com prazo finito', async () => {
    const { client, flushCalls } = createRecordingClient()

    const tracker = createErrorTracker({
      client,
      configuration: { dsn: DSN, environment: 'staging', release: RELEASE },
    })
    await tracker.flush()

    expect(flushCalls).toHaveLength(1)
    expect(flushCalls[0]).toBeGreaterThan(0)
  })
})

describe('contrato do rastreio de erro da API — redação ponta a ponta', () => {
  test('nenhuma forma de PII sobrevive ao beforeSend', () => {
    const { options } = initializeWithDsn()

    const scrubbed = JSON.stringify(options.beforeSend(createHostileEvent()))

    expect(scrubbed).not.toContain(CPF)
    expect(scrubbed).not.toContain(CNPJ)
    expect(scrubbed).not.toContain(EMAIL)
    expect(scrubbed).not.toContain(PHONE)
    expect(scrubbed).not.toContain(ACCESS_KEY)
    expect(scrubbed).not.toContain(SESSION_COOKIE)
    expect(scrubbed).not.toContain(IP_ADDRESS)
    expect(scrubbed).not.toContain('token-de-verdade')
  })

  test('identificador opaco e agrupamento do erro sobrevivem', () => {
    const { options } = initializeWithDsn()

    const scrubbed = JSON.stringify(options.beforeSend(createHostileEvent()))

    expect(scrubbed).toContain(COMPANY_ID)
    expect(scrubbed).toContain(CORRELATION_ID)
    expect(scrubbed).toContain('NfeImportError')
    expect(scrubbed).toContain('f0e1d2c3b4a5968778695a4b3c2d1e0f')
  })

  test('beforeSend devolve evento, nunca descarta em silêncio', () => {
    const { options } = initializeWithDsn()

    expect(options.beforeSend(createHostileEvent())).not.toBeNull()
  })
})

/**
 * A API converte toda falha em resposta antes de sair do processo — sem ligar o funil de 500 ao
 * rastreio, o SDK só veria exceção não capturada, que aqui nunca acontece.
 */
describe('contrato do rastreio de erro da API — funil de 500', () => {
  const silentLogger = {
    error: (): void => undefined,
    info: (): void => undefined,
    warn: (): void => undefined,
  }

  test('erro desconhecido vira 500 e chega ao rastreio', () => {
    const captured: unknown[] = []
    const failure = new Error('coluna inexistente')

    const response = createErrorResponse({
      captureError: (error: unknown) => captured.push(error),
      correlationId: CORRELATION_ID,
      error: failure,
      logger: silentLogger,
    })

    expect(response.status).toBe(500)
    expect(captured).toEqual([failure])
  })

  test('erro de domínio não vira ruído no rastreio', () => {
    const captured: unknown[] = []

    const response = createErrorResponse({
      captureError: (error: unknown) => captured.push(error),
      correlationId: CORRELATION_ID,
      error: new ApiError(HTTP_ERROR.notFound),
      logger: silentLogger,
    })

    expect(response.status).toBe(404)
    expect(captured).toHaveLength(0)
  })

  test('sem rastreio ligado o funil segue respondendo 500', () => {
    const response = createErrorResponse({
      correlationId: CORRELATION_ID,
      error: new Error('coluna inexistente'),
      logger: silentLogger,
    })

    expect(response.status).toBe(500)
  })
})
