/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'

export const SLOW_STEP_WARNING_MS = 10_000
export const CLOSE_CEILING_MS = 5_000

export type DisposableDatabaseStep = 'create' | 'migrate' | 'operation' | 'drop' | 'close'

export type ClosableResource = { readonly close: () => Promise<unknown> }

/** Starts a timer and returns the function that cancels it. */
export type ScheduleTimer = (callback: () => void, delayMs: number) => () => void

export type DisposableDatabaseDependencies = {
  readonly schedule: ScheduleTimer
  readonly warn: (message: string) => void
}

export type DisposableDatabaseLifecycle<TResource extends ClosableResource | undefined> = {
  readonly create: () => Promise<unknown>
  readonly migrate: () => Promise<unknown>
  readonly open: () => TResource
  readonly operation: (resource: TResource) => Promise<void>
  readonly drop: () => Promise<unknown>
  readonly closeAdmin: () => Promise<unknown>
  readonly dependencies?: DisposableDatabaseDependencies | undefined
}

export type WithDisposableDatabaseParams<TResource extends ClosableResource | undefined> = {
  readonly adminUrl: string
  readonly namePrefix: string
  readonly migrate: (connectionString: string) => Promise<unknown>
  readonly open: (connectionString: string) => TResource
  readonly operation: (resource: TResource, connectionString: string) => Promise<void>
}

const DEFAULT_DEPENDENCIES: DisposableDatabaseDependencies = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    return () => clearTimeout(timer)
  },
  warn(message) {
    console.warn(message)
  },
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown failure'
}

async function runStep<T>(
  step: DisposableDatabaseStep,
  work: () => Promise<T>,
  dependencies: DisposableDatabaseDependencies,
): Promise<T> {
  const cancelWarning = dependencies.schedule(() => {
    dependencies.warn(
      `[disposable-database] step "${step}" still running after ${SLOW_STEP_WARNING_MS / 1000}s`,
    )
  }, SLOW_STEP_WARNING_MS)
  try {
    return await work()
  } finally {
    cancelWarning()
  }
}

async function runTeardownStep(
  step: DisposableDatabaseStep,
  work: () => Promise<unknown>,
  dependencies: DisposableDatabaseDependencies,
): Promise<void> {
  try {
    await runStep(step, work, dependencies)
  } catch (error) {
    dependencies.warn(`[disposable-database] step "${step}" failed: ${describeFailure(error)}`)
  }
}

async function closeWithCeiling(
  resource: ClosableResource,
  dependencies: DisposableDatabaseDependencies,
): Promise<void> {
  let cancelCeiling = (): void => undefined
  const ceiling = new Promise<'ceiling'>((resolve) => {
    cancelCeiling = dependencies.schedule(() => resolve('ceiling'), CLOSE_CEILING_MS)
  })
  const closing = Promise.resolve()
    .then(() => resource.close())
    .then(() => 'closed' as const)
  // A close that loses the race must not surface later as an unhandled rejection.
  closing.catch(() => undefined)
  try {
    const outcome = await Promise.race([closing, ceiling])
    if (outcome === 'ceiling') {
      dependencies.warn(
        `[disposable-database] step "close" abandoned after ${CLOSE_CEILING_MS / 1000}s`,
      )
    }
  } catch (error) {
    dependencies.warn(`[disposable-database] step "close" failed: ${describeFailure(error)}`)
  } finally {
    cancelCeiling()
  }
}

export async function runDisposableDatabaseLifecycle<
  TResource extends ClosableResource | undefined,
>(lifecycle: DisposableDatabaseLifecycle<TResource>): Promise<void> {
  const dependencies = lifecycle.dependencies ?? DEFAULT_DEPENDENCIES
  let resource: TResource | undefined
  try {
    await runStep('create', lifecycle.create, dependencies)
    await runStep('migrate', lifecycle.migrate, dependencies)
    resource = lifecycle.open()
    const opened = resource
    await runStep('operation', () => lifecycle.operation(opened), dependencies)
  } finally {
    // The force drop goes first: it kills connections a stuck query keeps alive, so close() can settle.
    await runTeardownStep('drop', lifecycle.drop, dependencies)
    if (resource !== undefined) await closeWithCeiling(resource, dependencies)
    await runTeardownStep('close', lifecycle.closeAdmin, dependencies)
  }
}

export async function withDisposableDatabase<TResource extends ClosableResource | undefined>(
  params: WithDisposableDatabaseParams<TResource>,
): Promise<void> {
  const admin = new SQL(params.adminUrl, { max: 1 })
  const databaseName = `${params.namePrefix}_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(params.adminUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  const connectionString = disposableUrl.toString()
  await runDisposableDatabaseLifecycle({
    // Disposable database identifiers cannot be parameterized.
    create: () => admin.unsafe(`create database "${databaseName}"`),
    migrate: () => params.migrate(connectionString),
    open: () => params.open(connectionString),
    operation: (resource) => params.operation(resource, connectionString),
    drop: () => admin.unsafe(`drop database if exists "${databaseName}" with (force)`),
    closeAdmin: () => admin.close({ timeout: 0 }),
  })
}
