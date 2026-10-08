/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The occurrence type icon against a real Postgres: every name in the closed catalog is stored,
 * `NULL` keeps the type without an icon, and the CHECK refuses anything outside the catalog.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { findPostgresError } from '../../src/database/postgres-error.support.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { OCCURRENCE_TYPE_ICON_NAMES } from '../../src/shared/trip-occurrence.constant.js'
import type { OccurrenceTypeIconName } from '../../src/shared/trip-occurrence.constant.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const ICON_NAME_CHECK = 'company_occurrence_types_icon_name_check'
const TEST_TIMEOUT_MS = 60_000

async function insertType(input: {
  readonly companyId: string
  readonly database: TestDatabase
  readonly iconName: null | OccurrenceTypeIconName
}): Promise<string> {
  const id = crypto.randomUUID()
  await input.database.db.insert(companyOccurrenceTypes).values({
    companyId: input.companyId,
    iconName: input.iconName,
    id,
    name: `Icon probe ${id}`,
    stage: 'delivery',
  })
  return id
}

async function readIconName(database: TestDatabase, id: string): Promise<null | string> {
  const [stored] = await database.db
    .select({ iconName: companyOccurrenceTypes.iconName })
    .from(companyOccurrenceTypes)
    .where(eq(companyOccurrenceTypes.id, id))
  if (stored === undefined) throw new Error(`Occurrence type ${id} was not stored`)
  return stored.iconName
}

describe('occurrence type icon name in Postgres', () => {
  testWithPostgres(
    'stores every catalog name and NULL, and the CHECK refuses a name outside the catalog',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedCompany(database)

        for (const iconName of OCCURRENCE_TYPE_ICON_NAMES) {
          const id = await insertType({ companyId, database, iconName })
          expect(await readIconName(database, id)).toBe(iconName)
        }

        const withoutIcon = await insertType({ companyId, database, iconName: null })
        expect(await readIconName(database, withoutIcon)).toBeNull()

        const refusal = await insertType({
          companyId,
          database,
          iconName: 'rocket' as OccurrenceTypeIconName,
        }).then(
          () => null,
          (reason: unknown) => findPostgresError({ error: reason }),
        )
        expect(refusal).toEqual({ constraint: ICON_NAME_CHECK, sqlState: '23514' })

        const stored = await database.db
          .select({ id: companyOccurrenceTypes.id })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.companyId, companyId))
        expect(stored).toHaveLength(OCCURRENCE_TYPE_ICON_NAMES.length + 1)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
