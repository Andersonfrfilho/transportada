/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CLOSE_CEILING_MS,
  runDisposableDatabaseLifecycle,
  SLOW_STEP_WARNING_MS,
  type ClosableResource,
  type DisposableDatabaseDependencies,
} from './fixtures/disposable-database.fixture.js'

type FakeTimer = { readonly delayMs: number; readonly fire: () => void; cancelled: boolean }

function createFakeDependencies(options: { readonly autoFireDelayMs?: number } = {}) {
  const timers: FakeTimer[] = []
  const warnings: string[] = []
  const dependencies: DisposableDatabaseDependencies = {
    schedule(callback, delayMs) {
      const timer: FakeTimer = { cancelled: false, delayMs, fire: callback }
      timers.push(timer)
      if (delayMs === options.autoFireDelayMs) queueMicrotask(callback)
      return () => {
        timer.cancelled = true
      }
    },
    warn(message) {
      warnings.push(message)
    },
  }
  return { dependencies, timers, warnings }
}

function createLifecycle(overrides: {
  readonly events: string[]
  readonly resource?: ClosableResource
  readonly dependencies?: DisposableDatabaseDependencies
  readonly operation?: () => Promise<void>
  readonly drop?: () => Promise<unknown>
}) {
  const { events } = overrides
  const resource: ClosableResource = overrides.resource ?? {
    close: async () => {
      events.push('close')
    },
  }
  return {
    closeAdmin: async () => {
      events.push('closeAdmin')
    },
    create: async () => {
      events.push('create')
    },
    dependencies: overrides.dependencies,
    drop:
      overrides.drop ??
      (async () => {
        events.push('drop')
      }),
    migrate: async () => {
      events.push('migrate')
    },
    open: () => resource,
    operation:
      overrides.operation ??
      (async () => {
        events.push('operation')
      }),
  }
}

describe('disposable database lifecycle', () => {
  test('runs create, migrate, operation, then drops BEFORE closing the pool', async () => {
    const events: string[] = []
    const { dependencies } = createFakeDependencies()
    await runDisposableDatabaseLifecycle(createLifecycle({ dependencies, events }))
    expect(events).toEqual(['create', 'migrate', 'operation', 'drop', 'close', 'closeAdmin'])
  })

  test('a close that never resolves does not hang: the ceiling releases it and the drop already ran', async () => {
    const events: string[] = []
    const fake = createFakeDependencies({ autoFireDelayMs: CLOSE_CEILING_MS })
    const neverClosing: ClosableResource = { close: () => new Promise<void>(() => undefined) }
    await runDisposableDatabaseLifecycle(
      createLifecycle({ dependencies: fake.dependencies, events, resource: neverClosing }),
    )
    expect(events).toEqual(['create', 'migrate', 'operation', 'drop', 'closeAdmin'])
    expect(fake.warnings.some((message) => message.includes('"close" abandoned'))).toBe(true)
    expect(fake.timers.every((timer) => timer.cancelled)).toBe(true)
  })

  test('with real timers a never-closing pool returns within 6s and leaves no timer pending', async () => {
    const events: string[] = []
    const neverClosing: ClosableResource = { close: () => new Promise<void>(() => undefined) }
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (message: string) => {
      warnings.push(message)
    }
    const startedAt = performance.now()
    try {
      await runDisposableDatabaseLifecycle(createLifecycle({ events, resource: neverClosing }))
    } finally {
      console.warn = originalWarn
    }
    const elapsedMs = performance.now() - startedAt
    expect(elapsedMs).toBeGreaterThanOrEqual(CLOSE_CEILING_MS - 100)
    expect(elapsedMs).toBeLessThan(6_000)
    expect(events).toContain('drop')
    expect(warnings.some((message) => message.includes('"close" abandoned'))).toBe(true)
  }, 15_000)

  test('warns when a step runs past the slow threshold and names the step', async () => {
    const events: string[] = []
    const fake = createFakeDependencies()
    let release: () => void = () => undefined
    const running = runDisposableDatabaseLifecycle(
      createLifecycle({
        dependencies: fake.dependencies,
        events,
        operation: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    )
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const slowTimer = fake.timers.find(
      (timer) => timer.delayMs === SLOW_STEP_WARNING_MS && !timer.cancelled,
    )
    expect(slowTimer).toBeDefined()
    slowTimer?.fire()
    expect(fake.warnings).toEqual([expect.stringContaining('step "operation" still running')])
    release()
    await running
    expect(fake.timers.every((timer) => timer.cancelled)).toBe(true)
  })

  test('does not warn when every step is fast', async () => {
    const fake = createFakeDependencies()
    await runDisposableDatabaseLifecycle(
      createLifecycle({ dependencies: fake.dependencies, events: [] }),
    )
    expect(fake.warnings).toEqual([])
  })

  test('the failure of the operation propagates and teardown still happens', async () => {
    const events: string[] = []
    const { dependencies } = createFakeDependencies()
    const failure = new Error('operation failed')
    await expect(
      runDisposableDatabaseLifecycle(
        createLifecycle({
          dependencies,
          events,
          operation: async () => {
            throw failure
          },
        }),
      ),
    ).rejects.toBe(failure)
    expect(events).toEqual(['create', 'migrate', 'drop', 'close', 'closeAdmin'])
  })

  test('a failing drop is only warned about, never masks the operation failure, and leaks no connection string', async () => {
    const events: string[] = []
    const fake = createFakeDependencies()
    const failure = new Error('operation failed')
    await expect(
      runDisposableDatabaseLifecycle(
        createLifecycle({
          dependencies: fake.dependencies,
          drop: async () => {
            throw new Error('cannot connect to postgres://user:secret@host/db')
          },
          events,
          operation: async () => {
            throw failure
          },
        }),
      ),
    ).rejects.toBe(failure)
    expect(fake.warnings).toEqual([expect.stringContaining('step "drop" failed')])
    expect(fake.warnings.join(' ')).not.toContain('secret')
    expect(events).toContain('close')
  })

  test('a close that rejects is only warned about', async () => {
    const fake = createFakeDependencies()
    await runDisposableDatabaseLifecycle(
      createLifecycle({
        dependencies: fake.dependencies,
        events: [],
        resource: { close: async () => Promise.reject(new Error('boom')) },
      }),
    )
    expect(fake.warnings).toEqual([expect.stringContaining('step "close" failed')])
  })
})
