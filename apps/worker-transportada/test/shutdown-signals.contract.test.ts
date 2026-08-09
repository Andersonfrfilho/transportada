/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { startWorkerRuntime } from '../src/main.js'
import { registerWorkerShutdownSignals } from '../src/runtime/shutdown-signals.service.js'

const ENVIRONMENT = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/transportada',
  ENCRYPTION_ACTIVE_KEY_ID: 'test-key',
  ENCRYPTION_KEYRING_JSON: '{"test-key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada.shutdown.contract',
  RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
  WORKER_PORT: '53002',
} as const

const SIGNALS = ['SIGTERM', 'SIGINT'] as const

/**
 * Bootar o runtime instala handler no processo do teste. Sem devolver o processo ao estado anterior,
 * um teste deixa a contagem alterada para o seguinte e a medição do próximo vira ruído.
 */
function captureSignalListeners(): () => void {
  const before = new Map(
    SIGNALS.map((signal) => [signal, new Set(process.listeners(signal))] as const),
  )

  return () => {
    for (const signal of SIGNALS) {
      for (const listener of process.listeners(signal)) {
        if (!before.get(signal)?.has(listener)) {
          process.removeListener(signal, listener)
        }
      }
    }
  }
}

const silentLogger = {
  error(): void {},
  async flush(): Promise<void> {},
  info(): void {},
  stop(): void {},
  warn(): void {},
}

const noopRuntimeDependencies = {
  createDatabase() {
    return {
      close: async (): Promise<void> => undefined,
      db: {},
      healthCheck: async () => ({ healthy: true as const }),
    }
  },
  createLogger() {
    return silentLogger
  },
  createRabbitMqProvider: async () => ({
    close: async (): Promise<void> => undefined,
    consume: async () => {
      throw new Error('Este contrato injeta os consumidores diretamente')
    },
    healthCheck: async () => ({ healthy: true as const }),
    publish: async (): Promise<void> => undefined,
  }),
  createStorageGateway() {
    return {
      close: async (): Promise<void> => undefined,
      deleteObject: async (): Promise<void> => undefined,
      getObjectStream: async (): Promise<ReadableStream<Uint8Array>> =>
        new ReadableStream<Uint8Array>(),
      headObject: async (): Promise<undefined> => undefined,
      healthCheck: async () => ({ healthy: true as const }),
      storeObject: async () => ({
        bucket: 'bucket',
        contentLength: 0,
        contentType: 'application/xml',
        disposition: 'created' as const,
        key: 'key',
        provider: 's3' as const,
        sha256: '0'.repeat(64),
      }),
    }
  },
  startCteIssuanceConsumer: async () => ({ cancel: async (): Promise<void> => undefined }),
  startDistributionConsumer: async () => ({ cancel: async (): Promise<void> => undefined }),
  startHealthServer() {
    return { port: 53_002, stop: async (): Promise<void> => undefined }
  },
  startImportConsumer: async () => ({ cancel: async (): Promise<void> => undefined }),
  startMdfeIssuanceConsumer: async () => ({ cancel: async (): Promise<void> => undefined }),
}

let restoreSignalListeners: (() => void) | undefined

afterEach(() => {
  restoreSignalListeners?.()
  restoreSignalListeners = undefined
})

describe('contrato dos sinais de desligamento do worker', () => {
  /**
   * O consumidor sintético é o primeiro a consumir, e entre ele e o fim do boot há `await` de sobra
   * para o event loop entregar mensagem. Se o handler só existir depois, um SIGTERM nessa janela
   * mata o processo pela disposição padrão (exit 143) e o que estava em voo não é drenado — o que
   * num worker que dá ack em mensagem fiscal é perda, não apenas CI instável.
   */
  test('o handler já existe quando o primeiro consumidor começa a consumir', async () => {
    restoreSignalListeners = captureSignalListeners()
    const listenersBeforeBoot = process.listenerCount('SIGTERM')
    let listenersWhenConsumingStarted: number | undefined

    await startWorkerRuntime({
      dependencies: {
        ...noopRuntimeDependencies,
        startFoundationSyntheticConsumer: async () => {
          listenersWhenConsumingStarted = process.listenerCount('SIGTERM')
          return { cancel: async (): Promise<void> => undefined }
        },
      },
      environment: ENVIRONMENT,
    })

    expect(listenersWhenConsumingStarted).toBeGreaterThan(listenersBeforeBoot)
  })

  /**
   * Registrar cedo só serve se o sinal que chega antes do runtime ficar pronto ainda drenar. O
   * handler espera o boot terminar e só então para — nunca desiste do dreno por ter chegado cedo.
   */
  test('sinal recebido antes do runtime pronto drena assim que ele fica pronto', async () => {
    restoreSignalListeners = captureSignalListeners()
    const calls: string[] = []
    let resolveShutdown: ((shutdown: { stop(): Promise<void> }) => void) | undefined
    const pendingShutdown = new Promise<{ stop(): Promise<void> }>((resolve) => {
      resolveShutdown = resolve
    })

    registerWorkerShutdownSignals({
      logger: silentLogger,
      resolveShutdown: () => pendingShutdown,
    })

    process.emit('SIGTERM')
    await Bun.sleep(0)
    expect(calls).toEqual([])

    resolveShutdown?.({
      stop: async (): Promise<void> => {
        calls.push('shutdown.stop')
      },
    })
    await pendingShutdown
    await Bun.sleep(0)

    expect(calls).toEqual(['shutdown.stop'])
  })
})
