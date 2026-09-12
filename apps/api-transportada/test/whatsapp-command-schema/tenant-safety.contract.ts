/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildClaimFilters,
  buildJournalFilters,
  buildJournalStepFilters,
  buildRequestFilters,
  buildSettlementFilters,
} from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001451'
const REQUEST_ID = '00000000-0000-4000-8000-000000001452'
const STEP_ID = '00000000-0000-4000-8000-000000001453'
const HASH = 'a'.repeat(64)
const NOW = new Date('2026-09-12T12:00:00.000Z')

const dialect = new PgDialect()

const toQuery = (filters: readonly SQL[]) => dialect.sqlToQuery(and(...filters) as SQL)

const REQUESTS = '"whatsapp_command_requests"'
const DOCUMENTS = '"whatsapp_command_documents"'

describe('whatsapp command query tenant safety', () => {
  test('reads a request only inside the company of the context', () => {
    const query = toQuery(buildRequestFilters({ companyId: COMPANY_ID, id: REQUEST_ID }))

    expect(query.sql).toContain(`${REQUESTS}."company_id" = $`)
    expect(query.sql).toContain(`${REQUESTS}."id" = $`)
    expect(query.params).toEqual([COMPANY_ID, REQUEST_ID])
  })

  test('claims only the previewed request with the same hash that has not expired', () => {
    const query = toQuery(
      buildClaimFilters({ companyId: COMPANY_ID, id: REQUEST_ID, now: NOW, previewSha256: HASH }),
    )

    expect(query.sql).toContain(`${REQUESTS}."status" = $`)
    expect(query.sql).toContain(`${REQUESTS}."preview_sha256" = $`)
    expect(query.sql).toContain(`${REQUESTS}."expires_at" > $`)
    expect(query.params.slice(0, 4)).toEqual([COMPANY_ID, REQUEST_ID, 'previewed', HASH])
  })

  test('reads and writes the journal only inside the company', () => {
    const journal = toQuery(buildJournalFilters({ companyId: COMPANY_ID, requestId: REQUEST_ID }))
    expect(journal.sql).toContain(`${DOCUMENTS}."company_id" = $`)
    expect(journal.sql).toContain(`${DOCUMENTS}."request_id" = $`)

    const step = toQuery(buildJournalStepFilters({ companyId: COMPANY_ID, id: STEP_ID }))
    expect(step.sql).toContain(`${DOCUMENTS}."company_id" = $`)
    expect(step.sql).toContain(`${DOCUMENTS}."id" = $`)
  })

  test('sweeps settlement only inside the company', () => {
    const query = toQuery(
      buildSettlementFilters({ companyId: COMPANY_ID, stuckConfirmingBefore: NOW }),
    )

    expect(query.sql).toContain(`${REQUESTS}."company_id" = $`)
    expect(query.sql).toContain(`${REQUESTS}."confirmed_at" < $`)
  })

  test('never lets a filter reach the database without the company as first parameter', () => {
    const queries = [
      toQuery(buildRequestFilters({ companyId: COMPANY_ID, id: REQUEST_ID })),
      toQuery(
        buildClaimFilters({ companyId: COMPANY_ID, id: REQUEST_ID, now: NOW, previewSha256: HASH }),
      ),
      toQuery(buildJournalFilters({ companyId: COMPANY_ID, requestId: REQUEST_ID })),
      toQuery(buildJournalStepFilters({ companyId: COMPANY_ID, id: STEP_ID })),
      toQuery(buildSettlementFilters({ companyId: COMPANY_ID, stuckConfirmingBefore: NOW })),
    ]

    for (const query of queries) {
      expect(query.params[0]).toBe(COMPANY_ID)
      expect(query.sql).not.toContain(COMPANY_ID)
    }
  })
})
