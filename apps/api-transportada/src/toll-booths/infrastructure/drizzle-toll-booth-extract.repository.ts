/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A duplicidade do aceite 8 é a `pkey` natural `(dataset, observed_on)` da T101 — nunca um `SELECT`
 * antes do `INSERT` (janela de corrida), sempre o `23505` do banco mapeado aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { desc } from 'drizzle-orm'

import { tollBoothExtracts } from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  CreateTollBoothExtractRowInput,
  TollBoothExtractPort,
} from '../application/toll-booth-extract.port.js'
import { TollBoothExtractDuplicateError } from '../domain/toll-booth-extract.error.js'
import type { TollBoothExtractRow } from '../domain/toll-booth-extract.policy.js'

const PRIMARY_KEY_CONSTRAINT = 'toll_booth_extracts_pkey'

export type TollBoothExtractDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleTollBoothExtractRepository(
  database: TollBoothExtractDatabase,
): TollBoothExtractPort {
  return {
    async create(input: CreateTollBoothExtractRowInput): Promise<TollBoothExtractRow> {
      try {
        const [row] = await database
          .insert(tollBoothExtracts)
          .values({
            boothCount: input.boothCount,
            boothsWithAxleCharge: input.boothsWithAxleCharge,
            boothsWithCharge: input.boothsWithCharge,
            dataset: input.dataset,
            objectKey: input.objectKey,
            observedOn: input.observedOn,
            sha256: input.sha256,
            uploadedByUserId: input.uploadedByUserId,
          })
          .returning()

        return toRow(row as typeof tollBoothExtracts.$inferSelect)
      } catch (error) {
        if (violatedUniqueConstraint(error) === PRIMARY_KEY_CONSTRAINT) {
          throw new TollBoothExtractDuplicateError()
        }
        throw error
      }
    },
    async list(): Promise<readonly TollBoothExtractRow[]> {
      const rows = await database
        .select()
        .from(tollBoothExtracts)
        .orderBy(desc(tollBoothExtracts.observedOn), desc(tollBoothExtracts.dataset))

      return rows.map(toRow)
    },
  }
}

function toRow(row: typeof tollBoothExtracts.$inferSelect): TollBoothExtractRow {
  return {
    boothCount: row.boothCount,
    boothsWithAxleCharge: row.boothsWithAxleCharge,
    boothsWithCharge: row.boothsWithCharge,
    dataset: row.dataset,
    missingObjectObservedAt: row.missingObjectObservedAt,
    objectKey: row.objectKey,
    observedOn: row.observedOn,
    reloadedAt: row.reloadedAt,
    reloadedBoothCount: row.reloadedBoothCount,
    reloadedByUserId: row.reloadedByUserId,
    sha256: row.sha256,
    uploadedByUserId: row.uploadedByUserId,
  }
}
