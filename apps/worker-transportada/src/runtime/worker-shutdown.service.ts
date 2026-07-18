/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
interface ConsumerPort {
  cancel(): Promise<void>
}

interface CloseablePort {
  close(): Promise<void>
}

interface HealthServerPort {
  stop(): Promise<void>
}

interface WorkerShutdownDependencies {
  consumer?: ConsumerPort
  provider: CloseablePort
  database: CloseablePort
  healthServer: HealthServerPort
}

export class WorkerShutdown {
  readonly #dependencies: WorkerShutdownDependencies
  #stopping: Promise<void> | undefined

  constructor(dependencies: WorkerShutdownDependencies) {
    this.#dependencies = dependencies
  }

  stop(): Promise<void> {
    this.#stopping ??= this.#stopOnce()
    return this.#stopping
  }

  async #stopOnce(): Promise<void> {
    const errors: unknown[] = []

    await closeSafely(() => this.#dependencies.consumer?.cancel(), errors)
    await closeSafely(() => this.#dependencies.provider.close(), errors)
    await closeSafely(() => this.#dependencies.database.close(), errors)
    await closeSafely(() => this.#dependencies.healthServer.stop(), errors)

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Worker shutdown failed')
    }
  }
}

async function closeSafely(
  operation: () => Promise<void> | undefined,
  errors: unknown[],
): Promise<void> {
  try {
    await operation()
  } catch (error: unknown) {
    errors.push(error)
  }
}
