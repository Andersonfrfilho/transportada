/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.7 (D8), contra Postgres real: `missingNotificationTemplate` no feed e no detalhe — tipo que avisa a
 * contratante e sem modelo efetivo (exceção da contratante da nota ?? tipo).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  contractors,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import {
  findTripOccurrenceFeedItem,
  listTripOccurrenceFeed,
} from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedOccurrenceMailTemplate } from '../fixtures/occurrence-mail-template.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 90_000

async function typeIdOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [row] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (row?.typeId === null || row === undefined) throw new Error('TYPE_EXPECTED')
  return row.typeId
}

async function configure(
  database: TestDatabase,
  seeded: Seeded,
  changes: Partial<typeof companyOccurrenceTypes.$inferInsert>,
): Promise<void> {
  await database.db
    .update(companyOccurrenceTypes)
    .set(changes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, seeded.company.companyId),
        eq(companyOccurrenceTypes.id, await typeIdOf(database, seeded)),
      ),
    )
}

async function flagsOf(database: TestDatabase, seeded: Seeded) {
  const { companyId } = seeded.company
  const detail = await findTripOccurrenceFeedItem(database.db, {
    companyId,
    occurrenceId: seeded.occurrenceId,
  })
  const page = await listTripOccurrenceFeed(database.db, {
    companyId,
    cursor: null,
    limit: 20,
    order: 'desc',
  })
  const listed = page.items.find((item) => item.id === seeded.occurrenceId)
  return {
    detail: detail?.missingNotificationTemplate,
    listed: listed?.missingNotificationTemplate,
  }
}

describe('o aviso "Tipo sem modelo de notificação" (spec 269 T2.7)', () => {
  testWithPostgres(
    'só quando o tipo avisa a contratante e não há modelo efetivo, no feed e no detalhe',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company

        expect(await flagsOf(database, seeded)).toEqual({ detail: false, listed: false })

        await configure(database, seeded, {
          contractorMailTemplateId: null,
          emailsContractor: false,
        })
        expect(await flagsOf(database, seeded)).toEqual({ detail: false, listed: false })

        await configure(database, seeded, { emailsContractor: true })
        expect(await flagsOf(database, seeded)).toEqual({ detail: true, listed: true })

        const [contractor] = await database.db
          .select({ id: contractors.id })
          .from(contractors)
          .where(eq(contractors.companyId, companyId))
        const templateId = await seedOccurrenceMailTemplate(database, seeded.company)
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'optional',
          companyId,
          contractorId: contractor?.id ?? '',
          contractorMailTemplateId: templateId,
          occurrenceTypeId: await typeIdOf(database, seeded),
        })
        expect(await flagsOf(database, seeded)).toEqual({ detail: false, listed: false })

        await database.db
          .update(companyOccurrenceTypeContractorOverrides)
          .set({ contractorMailTemplateId: null })
          .where(eq(companyOccurrenceTypeContractorOverrides.companyId, companyId))
        expect(await flagsOf(database, seeded)).toEqual({ detail: true, listed: true })

        await configure(database, seeded, { contractorMailTemplateId: templateId })
        expect(await flagsOf(database, seeded)).toEqual({ detail: false, listed: false })
      })
    },
    TEST_TIMEOUT_MS,
  )
})
