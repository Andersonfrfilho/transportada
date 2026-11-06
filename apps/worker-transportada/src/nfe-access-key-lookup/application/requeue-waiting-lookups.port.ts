/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type AccessKeyLookupRequeuePort = {
  requeueDueLookups(input: { readonly now: Date }): Promise<{ readonly requeuedCount: number }>
}
