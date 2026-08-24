/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildJobRunRabbitMqTopology } from '../../src/messaging/job-run-rabbitmq-topology.js'

const QUEUE_PREFIX = 'transportada'

describe('job run rabbitmq topology', () => {
  const topology = buildJobRunRabbitMqTopology({ queuePrefix: QUEUE_PREFIX })

  test('nomeia main, retry e dead exatamente como o cron publica', () => {
    expect(topology.exchange).toBe('transportada.job-run.v1.main.exchange')
    expect(topology.queue).toBe('transportada.job-run.v1.main.queue')
    expect(topology.routingKey).toBe('transportada.job-run.v1.main')
    expect(topology.retry.exchange).toBe('transportada.job-run.v1.retry.exchange')
    expect(topology.retry.queue).toBe('transportada.job-run.v1.retry.queue')
    expect(topology.retry.routingKey).toBe('transportada.job-run.v1.retry')
    expect(topology.deadLetter.exchange).toBe('transportada.job-run.v1.dead.exchange')
    expect(topology.deadLetter.queue).toBe('transportada.job-run.v1.dead.queue')
    expect(topology.deadLetter.routingKey).toBe('transportada.job-run.v1.dead')
  })

  test('a política de retry é a mesma dos outros trilhos', () => {
    expect(topology.retry.delayMs).toBe(60_000)
    expect(topology.retry.maxRetries).toBe(3)
  })
})
