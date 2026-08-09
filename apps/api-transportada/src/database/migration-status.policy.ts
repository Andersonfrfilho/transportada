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

type ResolveMigrationsDirectoryParams = {
  readonly candidates: readonly string[]
  readonly exists: (path: string) => boolean
}

/** O bundle roda de `dist/` e o fonte de `src/database/`: o caminho certo depende de quem chamou. */
export function resolveMigrationsDirectory({
  candidates,
  exists,
}: ResolveMigrationsDirectoryParams): string | undefined {
  return candidates.find(exists)
}
