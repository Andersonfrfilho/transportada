/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildRetryScheduleFilters } from '../../src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.js'

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000801'
const COMPANY_ID = '00000000-0000-4000-8000-000000000802'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e retry schedule query tenant safety', () => {
  test('scopes the retry schedule lookup by company and attempt', () => {
    const query = toSql(buildRetryScheduleFilters({ attemptId: ATTEMPT_ID, companyId: COMPANY_ID }))

    expect(query.sql).toContain('"cte_retry_schedules"."company_id" = $')
    expect(query.sql).toContain('"cte_retry_schedules"."attempt_id" = $')
    expect(query.params).toEqual([COMPANY_ID, ATTEMPT_ID])
  })
})
