/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { startWorkerRuntime } from '../src/main.js'
import { OutboxRelayLoop } from '../src/outbox/application/outbox-relay-loop.service.js'

const ENVIRONMENT = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/transportada',
  ENCRYPTION_ACTIVE_KEY_ID: 'test-key',
  ENCRYPTION_KEYRING_JSON: '{"test-key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada.runtime.contract',
  RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
  WORKER_PORT: '53002',
} as const

describe('NF-e worker runtime contract', () => {
  test('logs relay failures with the configured domain-specific message', async () => {
    const errors: readonly string[] = []
    const mutableErrors: string[] = []
    const loop = new OutboxRelayLoop({
      claimOwner: 'transportada.runtime.contract.relay',
      clock: {
        clearInterval(timer) {
          clearInterval(timer)
        },
        setInterval(handler, intervalMs) {
          return setInterval(handler, intervalMs)
        },
      },
      failureMessage: 'cte_outbox_relay_failed',
      intervalMs: 60_000,
      leaseMs: 30_000,
      limit: 25,
      logger: {
        error(message) {
          mutableErrors.push(message)
        },
        info() {},
        warn() {},
      },
      relay: {
        async relayDueEntries() {
          throw new Error('relation "cte_issuance_outbox" does not exist')
        },
      },
    })

    loop.start()
    await Bun.sleep(0)
    await loop.close()

    expect(errors.concat(mutableErrors)).toEqual(['cte_outbox_relay_failed'])
  })

  test('starts relay plus synthetic/import/distribution consumers independently and drains them before infrastructure shutdown', async () => {
    const calls: string[] = []
    const importCancellation = createDeferred()
    const runtime = await startWorkerRuntime({
      dependencies: {
        createDatabase() {
          return {
            close: async () => {
              calls.push('database.close')
            },
            db: {},
            healthCheck: async () => ({ healthy: true as const }),
          }
        },
        createLogger() {
          return {
            error() {},
            async flush() {},
            info() {},
            stop() {},
            warn() {},
          }
        },
        createRabbitMqProvider: async ({ topology }) => ({
          close: async () => {
            calls.push(`provider.close:${topology.queue}`)
          },
          consume: async () => {
            throw new Error('Runtime contract should inject consumers directly')
          },
          healthCheck: async () => ({ healthy: true as const }),
          publish: async () => undefined,
        }),
        createStorageGateway() {
          return {
            close: async () => {
              calls.push('storage.close')
            },
            deleteObject: async () => undefined,
            getObjectStream: async () => new ReadableStream<Uint8Array>(),
            headObject: async () => undefined,
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
        startDistributionConsumer: async () => ({
          cancel: async () => {
            calls.push('distribution.cancel')
          },
        }),
        startCteIssuanceConsumer: async () => ({
          cancel: async () => {
            calls.push('cteIssuance.cancel')
          },
        }),
        startMdfeIssuanceConsumer: async () => ({
          cancel: async () => {
            calls.push('mdfeIssuance.cancel')
          },
        }),
        startNfseIssuanceConsumer: async () => ({
          cancel: async () => {
            calls.push('nfseIssuance.cancel')
          },
        }),
        startInvitationDeliveryConsumer: async () => ({
          cancel: async () => {
            calls.push('invitationDelivery.cancel')
          },
        }),
        startPasswordResetDeliveryConsumer: async () => ({
          cancel: async () => {
            calls.push('passwordResetDelivery.cancel')
          },
        }),
        startFoundationSyntheticConsumer: async () => ({
          cancel: async () => {
            calls.push('synthetic.cancel')
          },
        }),
        startHealthServer() {
          return {
            port: 53002,
            stop: async () => {
              calls.push('health.stop')
            },
          }
        },
        startImportConsumer: async () => ({
          cancel: async () => {
            calls.push('import.cancel')
            await importCancellation.promise
          },
        }),
      },
      environment: ENVIRONMENT,
    })

    const stops = [runtime.shutdown.stop(), runtime.shutdown.stop()]
    await Bun.sleep(0)
    expect(calls).toEqual(['synthetic.cancel', 'import.cancel'])

    importCancellation.resolve()
    await Promise.all(stops)

    expect(calls).toEqual([
      'synthetic.cancel',
      'import.cancel',
      'distribution.cancel',
      'cteIssuance.cancel',
      'mdfeIssuance.cancel',
      'nfseIssuance.cancel',
      'invitationDelivery.cancel',
      'passwordResetDelivery.cancel',
      'storage.close',
      'provider.close:transportada.runtime.contract.synthetic.v1.main.queue',
      'provider.close:transportada.runtime.contract.nfe-import.v1.main.queue',
      'provider.close:transportada.runtime.contract.nfe-distribution.v1.main.queue',
      'provider.close:transportada.runtime.contract.cte-issuance.v1.main.queue',
      'provider.close:transportada.runtime.contract.mdfe-issuance.v1.main.queue',
      'provider.close:transportada.runtime.contract.nfse-issuance.v1.main.queue',
      'provider.close:transportada.runtime.contract.invitation-delivery.v1.main.queue',
      'provider.close:transportada.runtime.contract.password-reset-delivery.v1.main.queue',
      'database.close',
      'health.stop',
    ])
  })

  test('reports readiness with storage as a first-class dependency', async () => {
    const runtime = await startWorkerRuntime({
      dependencies: {
        createDatabase() {
          return {
            close: async () => undefined,
            db: {},
            healthCheck: async () => ({ healthy: true as const }),
          }
        },
        createLogger() {
          return {
            error() {},
            async flush() {},
            info() {},
            stop() {},
            warn() {},
          }
        },
        createRabbitMqProvider: async () => ({
          close: async () => undefined,
          consume: async () => {
            throw new Error('Runtime contract should inject consumers directly')
          },
          healthCheck: async () => ({ healthy: true as const }),
          publish: async () => undefined,
        }),
        createStorageGateway() {
          return {
            close: async () => undefined,
            deleteObject: async () => undefined,
            getObjectStream: async () => new ReadableStream<Uint8Array>(),
            headObject: async () => undefined,
            healthCheck: async () => {
              throw new Error('storage down')
            },
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
        startDistributionConsumer: async () => undefined,
        startCteIssuanceConsumer: async () => undefined,
        startMdfeIssuanceConsumer: async () => undefined,
        startNfseIssuanceConsumer: async () => undefined,
        startInvitationDeliveryConsumer: async () => undefined,
        startPasswordResetDeliveryConsumer: async () => undefined,
        startFoundationSyntheticConsumer: async () => undefined,
        startHealthServer() {
          return {
            port: 53003,
            stop: async () => undefined,
          }
        },
        startImportConsumer: async () => undefined,
      },
      environment: ENVIRONMENT,
    })

    const response = await new Response(
      JSON.stringify(
        await new (await import('../src/health/health.service.js')).WorkerHealthService({
          database: { healthCheck: async () => ({ healthy: true as const }) },
          rabbitMq: { healthCheck: async () => ({ healthy: true as const }) },
          storage: {
            healthCheck: async () => {
              throw new Error('storage down')
            },
          },
        }).ready(),
      ),
    )
    expect(JSON.parse(await response.text())).toEqual({
      dependencies: {
        database: 'up',
        rabbitmq: 'up',
        storage: 'down',
      },
      service: 'worker',
      status: 'degraded',
      timestamp: expect.any(String),
    })

    await runtime.shutdown.stop()
  })
})

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve() {
      if (!resolvePromise) {
        throw new Error('Deferred resolver is unavailable')
      }
      resolvePromise()
    },
  }
}
