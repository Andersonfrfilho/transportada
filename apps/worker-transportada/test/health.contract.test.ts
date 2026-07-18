/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { WorkerHealthService } from '../src/health/health.service.js'
import { createHealthRequestHandler } from '../src/http/health-request-handler.service.js'

describe('worker health HTTP contract', () => {
  test('keeps liveness independent from PostgreSQL and RabbitMQ', async () => {
    let checks = 0
    const fixture = createFixture({
      databaseHealthCheck: async () => {
        checks += 1
        throw new Error('postgresql://user:secret@private')
      },
      rabbitMqHealthCheck: async () => {
        checks += 1
        throw new Error('amqp://user:secret@private')
      },
    })

    const response = await fixture.handle(
      new Request('http://localhost/health/live', {
        headers: { 'x-correlation-id': 'worker-contract-123' },
      }),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-correlation-id')).toBe('worker-contract-123')
    expect(await response.json()).toEqual({
      service: 'worker',
      status: 'ok',
      timestamp: '2026-07-18T20:00:00.000Z',
    })
    expect(checks).toBe(0)
  })

  test('reports PostgreSQL and RabbitMQ readiness', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      dependencies: {
        database: 'up',
        rabbitmq: 'up',
      },
      service: 'worker',
      status: 'ok',
      timestamp: '2026-07-18T20:00:00.000Z',
    })
  })

  test('returns safe degraded readiness when RabbitMQ is unavailable', async () => {
    const fixture = createFixture({
      rabbitMqHealthCheck: async () => {
        throw new Error('amqp://user:secret@private')
      },
    })
    const response = await fixture.handle(
      new Request('http://localhost/health/ready'),
      fixture.server,
    )

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      dependencies: {
        database: 'up',
        rabbitmq: 'down',
      },
      service: 'worker',
      status: 'degraded',
      timestamp: '2026-07-18T20:00:00.000Z',
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  test('returns a typed correlated error for an unknown route', async () => {
    const fixture = createFixture({
      createCorrelationId: () => 'generated-worker-correlation',
    })
    const response = await fixture.handle(
      new Request('http://localhost/private?token=secret'),
      fixture.server,
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('x-correlation-id')).toBe('generated-worker-correlation')
    expect(await response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        correlationId: 'generated-worker-correlation',
        message: 'Route not found',
      },
    })
  })

  test('rejects unsupported health methods with an Allow header', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      new Request('http://localhost/health/live', { method: 'POST' }),
      fixture.server,
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})

function createFixture(
  params: {
    createCorrelationId?: () => string
    databaseHealthCheck?: () => Promise<{ readonly healthy: true }>
    rabbitMqHealthCheck?: () => Promise<{ readonly healthy: true }>
  } = {},
) {
  const healthService = new WorkerHealthService({
    database: {
      healthCheck: params.databaseHealthCheck ?? (async () => ({ healthy: true })),
    },
    now: () => new Date('2026-07-18T20:00:00.000Z'),
    rabbitMq: {
      healthCheck: params.rabbitMqHealthCheck ?? (async () => ({ healthy: true })),
    },
  })
  const logger = {
    error() {},
    info() {},
    warn() {},
  }

  return {
    handle: createHealthRequestHandler({
      createCorrelationId: params.createCorrelationId,
      healthService,
      logger,
    }),
    server: {
      timeout() {},
    },
  }
}
