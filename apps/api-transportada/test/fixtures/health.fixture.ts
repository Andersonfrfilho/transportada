/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MigrationStatusPort } from '../../src/shared/api.types'

/** Fixture de banco em dia: quem testa rota não deve reencenar o journal de migrations. */
export function appliedMigrations(): MigrationStatusPort {
  return {
    async countPending() {
      return 0
    },
  }
}
