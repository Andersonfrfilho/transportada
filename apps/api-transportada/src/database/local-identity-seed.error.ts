/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export class LocalIdentitySeedConflictError extends Error {
  public override readonly name = 'LocalIdentitySeedConflictError'

  public constructor(entity: string) {
    super(`Local identity seed conflicts with the existing ${entity}`)
  }
}
