/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Postgres session advisory lock (pg_try_advisory_lock) — the project forbids
 * Redis/Redlock, so single-instance-per-cycle is guaranteed by the database.
 */
export type AdvisoryLockPort = {
  tryAcquire(input: { readonly lockKey: string }): Promise<boolean>
  release(input: { readonly lockKey: string }): Promise<void>
}
