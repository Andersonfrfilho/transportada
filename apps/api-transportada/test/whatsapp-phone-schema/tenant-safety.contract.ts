/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildLiveRequestByPhoneFilters,
  buildLiveRequestByUserFilters,
  buildRequestWriteFilters,
} from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001441'
const USER_ID = '00000000-0000-4000-8000-000000001442'
const REQUEST_ID = '00000000-0000-4000-8000-000000001443'
const PHONE = '5516991234567'

const dialect = new PgDialect()

const toQuery = (filters: readonly SQL[]) => dialect.sqlToQuery(and(...filters) as SQL)

describe('whatsapp phone verification query tenant safety', () => {
  test('closes the previous live request of one user inside one company only', () => {
    const query = toQuery(buildLiveRequestByUserFilters({ companyId: COMPANY_ID, userId: USER_ID }))

    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."company_id" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."user_id" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."consumed_at" is null')
    expect(query.params).toEqual([COMPANY_ID, USER_ID])
  })

  test('finds the live request by the sender phone, scoped by the channel company', () => {
    const query = toQuery(buildLiveRequestByPhoneFilters({ companyId: COMPANY_ID, phone: PHONE }))

    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."company_id" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."phone" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."consumed_at" is null')
    expect(query.params).toEqual([COMPANY_ID, PHONE])
  })

  test('scopes every write on a request by company and request', () => {
    const query = toQuery(
      buildRequestWriteFilters({ companyId: COMPANY_ID, requestId: REQUEST_ID }),
    )

    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."company_id" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."id" = $')
    expect(query.sql).toContain('"whatsapp_phone_verification_requests"."consumed_at" is null')
    expect(query.params).toEqual([COMPANY_ID, REQUEST_ID])
  })

  test('never lets a request filter reach the database without the company as first parameter', () => {
    const queries = [
      toQuery(buildLiveRequestByUserFilters({ companyId: COMPANY_ID, userId: USER_ID })),
      toQuery(buildLiveRequestByPhoneFilters({ companyId: COMPANY_ID, phone: PHONE })),
      toQuery(buildRequestWriteFilters({ companyId: COMPANY_ID, requestId: REQUEST_ID })),
    ]

    for (const query of queries) {
      expect(query.params[0]).toBe(COMPANY_ID)
      expect(query.sql).not.toContain(COMPANY_ID)
    }
  })
})
