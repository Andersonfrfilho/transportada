/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { buildNfeAccessKeyRabbitMqTopology } from '../../src/messaging/nfe-access-key-rabbitmq-topology.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from '../../src/messaging/nfe-rabbitmq-topology.js'
import { NfeOutboxPublisherService } from '../../src/outbox/application/nfe-outbox-publisher.service.js'

const queuePrefix = 'transportada.contract'

describe('access key lookup routing contract', () => {
  test('the topology follows the sibling naming with main, retry and dead queues', () => {
    expect(buildNfeAccessKeyRabbitMqTopology({ queuePrefix })).toEqual({
      deadLetter: {
        exchange: 'transportada.contract.nfe-access-key.v1.dead.exchange',
        queue: 'transportada.contract.nfe-access-key.v1.dead.queue',
        routingKey: 'transportada.contract.nfe-access-key.v1.dead',
      },
      exchange: 'transportada.contract.nfe-access-key.v1.main.exchange',
      queue: 'transportada.contract.nfe-access-key.v1.main.queue',
      retry: {
        delayMs: 5_000,
        exchange: 'transportada.contract.nfe-access-key.v1.retry.exchange',
        maxRetries: 3,
        queue: 'transportada.contract.nfe-access-key.v1.retry.queue',
        routingKey: 'transportada.contract.nfe-access-key.v1.retry',
      },
      routingKey: 'transportada.contract.nfe-access-key.v1.main',
    })
  })

  test('the outbox publisher resolves the access key provider by its own queue', () => {
    const providers = {
      accessKey: {} as RabbitMqProvider,
      distribution: {} as RabbitMqProvider,
      import: {} as RabbitMqProvider,
    }
    const accessKeyTopology = buildNfeAccessKeyRabbitMqTopology({ queuePrefix })
    const publisher = new NfeOutboxPublisherService({
      accessKeyProvider: providers.accessKey,
      accessKeyTopology,
      distributionProvider: providers.distribution,
      distributionTopology: buildNfeDistributionRabbitMqTopology({ queuePrefix }),
      importProvider: providers.import,
      importTopology: buildNfeImportRabbitMqTopology({ queuePrefix }),
    })

    expect(publisher.resolveProvider(accessKeyTopology)).toBe(providers.accessKey)
  })
})
