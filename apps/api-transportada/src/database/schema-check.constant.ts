/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Renders a literal enumeration for an `in (...)` check constraint. */
export const inList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ')
