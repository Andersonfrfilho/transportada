/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type RateLimitedFetch = (input: string, init: RequestInit) => Promise<Response>

export type CreateRateLimitedFetchParams = {
  readonly clock: () => number
  readonly fetch: RateLimitedFetch
  readonly minIntervalMilliseconds: number
  readonly sleep: (milliseconds: number) => Promise<void>
}
