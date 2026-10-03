/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3: o perfil e o contratante são alcançados pela empresa e pelo id na mesma condição,
 * nunca pelo id sozinho (OWASP API1/BOLA).
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildReceivingProfileContractorFilters,
  buildReceivingProfileFilters,
} from '../../src/cargo-receiving/infrastructure/drizzle-contractor-receiving-profile.repository.js'

const dialect = new PgDialect()
const COMPANY_ID = '00000000-0000-4000-8000-000000000c01'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c02'

describe('isolamento do perfil de recebimento (spec 237 T1.3)', () => {
  test('o contratante é procurado pela empresa e pelo id juntos', () => {
    const query = dialect.sqlToQuery(
      and(
        ...buildReceivingProfileContractorFilters({
          companyId: COMPANY_ID,
          contractorId: CONTRACTOR_ID,
        }),
      )!,
    )

    expect(query.sql).toContain('"contractors"."company_id" = $')
    expect(query.sql).toContain('"contractors"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, CONTRACTOR_ID])
  })

  test('o perfil é procurado pela empresa e pelo contratante juntos', () => {
    const query = dialect.sqlToQuery(
      and(...buildReceivingProfileFilters({ companyId: COMPANY_ID, contractorId: CONTRACTOR_ID }))!,
    )

    expect(query.sql).toContain('"contractor_receiving_profiles"."company_id" = $')
    expect(query.sql).toContain('"contractor_receiving_profiles"."contractor_id" = $')
    expect(query.params).toEqual([COMPANY_ID, CONTRACTOR_ID])
  })
})
