/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronLogger } from '../../src/config/cron.types.js'
import type { AdvisoryLockPort } from '../../src/shared/advisory-lock.port.js'
import type { JobRunEnvelopeV1 } from '../../src/tick/domain/job-run-envelope.schema.js'
import type { JobRunPublisherPort } from '../../src/tick/application/job-run-publisher.port.js'

export const SILENT_LOGGER: CronLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

export type LockDouble = AdvisoryLockPort & {
  readonly acquiredKeys: readonly string[]
  readonly releasedKeys: readonly string[]
}

export function createLockDouble(granted: boolean): LockDouble {
  const acquiredKeys: string[] = []
  const releasedKeys: string[] = []
  return {
    acquiredKeys,
    releasedKeys,
    tryAcquire({ lockKey }) {
      acquiredKeys.push(lockKey)
      return Promise.resolve(granted)
    },
    release({ lockKey }) {
      releasedKeys.push(lockKey)
      return Promise.resolve()
    },
  }
}

export type PublisherDouble = JobRunPublisherPort & {
  readonly published: readonly JobRunEnvelopeV1[]
}

type CreatePublisherDoubleParams = {
  readonly failFor?: string
}

export function createPublisherDouble(params: CreatePublisherDoubleParams = {}): PublisherDouble {
  const published: JobRunEnvelopeV1[] = []
  return {
    published,
    publish({ envelope }) {
      if (envelope.payload.job === params.failFor) {
        return Promise.reject(new Error('broker unreachable'))
      }
      published.push(envelope)
      return Promise.resolve()
    },
  }
}

export function createEventIdFactory(): () => string {
  let sequence = 0
  return () => {
    sequence += 1
    return `00000000-0000-4000-8000-0000000000e${String(sequence)}`
  }
}

export type LoggedMessage = {
  readonly message: string
  readonly metadata: Record<string, unknown> | undefined
}

export type LoggerDouble = CronLogger & {
  readonly messages: readonly LoggedMessage[]
}

export function createLoggerDouble(): LoggerDouble {
  const messages: LoggedMessage[] = []
  const record =
    () =>
    (message: string, metadata?: Record<string, unknown>): void => {
      messages.push({ message, metadata })
    }
  return { error: record(), info: record(), messages, warn: record() }
}
