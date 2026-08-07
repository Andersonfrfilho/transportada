/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

type ListPendingMigrationsParams = {
  readonly appliedNames: readonly string[]
  readonly shippedNames: readonly string[]
}

/** Mesma conta do `getMigrationsToRun` do drizzle: pendente é a pasta que o journal não registrou. */
export function listPendingMigrations({
  appliedNames,
  shippedNames,
}: ListPendingMigrationsParams): readonly string[] {
  const applied = new Set(appliedNames)

  return shippedNames.filter((name) => !applied.has(name))
}
