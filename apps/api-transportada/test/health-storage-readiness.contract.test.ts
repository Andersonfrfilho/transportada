/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service.js'
import type { DependencyStatus } from '../src/shared/api.types.js'

function createHealthService(storage?: { health: () => Promise<{ status: DependencyStatus }> }) {
  return new HealthService({
    database: {
      async close() {},
      async healthCheck() {
        return { healthy: true }
      },
    },
    identityReadiness: {
      async checkReadiness() {
        return true
      },
    },
    migrationStatus: {
      async countPending() {
        return 0
      },
    },
    readinessTimeoutMs: 50,
    ...(storage === undefined ? {} : { storage }),
  })
}

describe('Prontidão do bucket', () => {
  test('bucket respondendo deixa a prontidão ok', async () => {
    const readiness = await createHealthService({ health: async () => ({ status: 'up' }) }).ready()

    expect(readiness.dependencies.storage).toBe('up')
    expect(readiness.status).toBe('ok')
  })

  test('chave vencida (health down) derruba a prontidão', async () => {
    const readiness = await createHealthService({
      health: async () => ({ status: 'down' }),
    }).ready()

    expect(readiness.dependencies.storage).toBe('down')
    expect(readiness.status).toBe('degraded')
  })

  test('bucket que lança ou pendura é down, não resposta presa', async () => {
    const throwing = await createHealthService({
      health: async () => {
        throw new Error('SignatureDoesNotMatch')
      },
    }).ready()
    const hanging = await createHealthService({ health: () => new Promise(() => {}) }).ready()

    expect(throwing.dependencies.storage).toBe('down')
    expect(hanging.dependencies.storage).toBe('down')
  })

  test('sem bucket ligado a chave some do corpo', async () => {
    const readiness = await createHealthService().ready()

    expect(readiness.dependencies).toEqual({ database: 'up', identity: 'up', migrations: 'up' })
  })
})
