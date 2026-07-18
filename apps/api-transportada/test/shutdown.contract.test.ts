/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createShutdownHandler } from '../src/server/server.service'
import type { ApiLogger, DatabaseHealthPort, StoppableServer } from '../src/shared/api.types'

describe('API shutdown contract', () => {
  test('stops accepting requests before closing PostgreSQL and is idempotent', async () => {
    const events: string[] = []
    const server: StoppableServer = {
      async stop() {
        events.push('server.stop')
      },
    }
    const database: DatabaseHealthPort = {
      async healthCheck() {
        return { healthy: true }
      },
      async close() {
        events.push('database.close')
      },
    }
    const logger: ApiLogger = {
      error() {},
      info() {},
      warn() {},
    }
    const shutdown = createShutdownHandler({ database, logger, server })

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM')])

    expect(events).toEqual(['server.stop', 'database.close'])
  })

  test('closes PostgreSQL even when stopping the server fails', async () => {
    const events: string[] = []
    const server: StoppableServer = {
      async stop() {
        events.push('server.stop')
        throw new Error('stop failed')
      },
    }
    const database: DatabaseHealthPort = {
      async healthCheck() {
        return { healthy: true }
      },
      async close() {
        events.push('database.close')
      },
    }
    const logger: ApiLogger = {
      error() {},
      info() {},
      warn() {},
    }
    const shutdown = createShutdownHandler({ database, logger, server })

    await expect(shutdown('SIGTERM')).rejects.toThrow('stop failed')
    expect(events).toEqual(['server.stop', 'database.close'])
  })
})
