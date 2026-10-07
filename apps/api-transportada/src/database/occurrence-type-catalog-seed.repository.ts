/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { companies } from './identity.schema.js'
import { companyOccurrenceTypes } from './trip.schema.js'
import type { OccurrenceTypeCatalogSeedPort } from './occurrence-type-catalog-seed.service.js'

type Queryable =
  | ReturnType<typeof createDrizzleProvider>['db']
  | Parameters<Parameters<ReturnType<typeof createDrizzleProvider>['db']['transaction']>[0]>[0]

export function createDrizzleOccurrenceTypeCatalogSeedPort(
  queryable: Queryable,
): OccurrenceTypeCatalogSeedPort {
  return {
    async listCompanyIds() {
      const rows = await queryable
        .select({ id: companies.id })
        .from(companies)
        .orderBy(asc(companies.id))

      return rows.map((row) => row.id)
    },
    async hasAnyOccurrenceType({ companyId, stages }) {
      const [row] = await queryable
        .select({ id: companyOccurrenceTypes.id })
        .from(companyOccurrenceTypes)
        .where(
          and(
            eq(companyOccurrenceTypes.companyId, companyId),
            inArray(companyOccurrenceTypes.stage, [...stages]),
          ),
        )
        .limit(1)

      return row !== undefined
    },
    async insertOccurrenceTypes({ companyId, types }) {
      const inserted = await queryable
        .insert(companyOccurrenceTypes)
        .values(
          types.map((type) => ({
            companyId,
            itemsMode: type.itemsMode,
            name: type.name,
            ...(type.redeliveryPolicy === undefined
              ? {}
              : { redeliveryPolicy: type.redeliveryPolicy }),
            stage: type.stage,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: companyOccurrenceTypes.id })
      return inserted.length
    },
  }
}
