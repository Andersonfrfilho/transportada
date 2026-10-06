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
  buildAvailableDocumentFilters,
  buildCandidateDocumentFilters,
} from '../../src/cargo-receiving/infrastructure/cargo-arrival-document.query.js'
import {
  buildArrivalDocumentFilters,
  buildArrivalFilters,
} from '../../src/cargo-receiving/infrastructure/cargo-arrival-persistence.support.js'
import { buildArrivalListFilters } from '../../src/cargo-receiving/infrastructure/cargo-arrival-list.query.js'
import { buildPreviewItemFilters } from '../../src/cargo-receiving/infrastructure/cargo-preview-item.query.js'
import {
  buildPreviewFilters,
  buildPreviewListFilters,
} from '../../src/cargo-receiving/infrastructure/cargo-preview-persistence.support.js'
import {
  buildReceivingProfileContractorFilters,
  buildReceivingProfileFilters,
} from '../../src/cargo-receiving/infrastructure/drizzle-contractor-receiving-profile.repository.js'
import { buildReceivingProfileListFilters } from '../../src/cargo-receiving/infrastructure/contractor-receiving-profile-list.query.js'

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

  test('a lista dos perfis começa pela empresa, com ou sem filtro (revisão, M4)', () => {
    const bare = dialect.sqlToQuery(
      and(
        ...buildReceivingProfileListFilters({
          companyId: COMPANY_ID,
          paging: { cursor: null, limit: 25 },
        }),
      )!,
    )
    expect(bare.sql).toBe('"contractor_receiving_profiles"."company_id" = $1')
    const filtered = dialect.sqlToQuery(
      and(
        ...buildReceivingProfileListFilters({
          companyId: COMPANY_ID,
          enabled: true,
          paging: { cursor: CONTRACTOR_ID, limit: 25 },
        }),
      )!,
    )
    expect(filtered.sql).toMatch(/^\(+"contractor_receiving_profiles"\."company_id" = \$1\)? and /u)
    expect(filtered.params[0]).toBe(COMPANY_ID)
  })
})

describe('isolamento da chegada (spec 237 T2.3)', () => {
  const ARRIVAL_ID = '00000000-0000-4000-8000-000000000c03'
  const render = (filters: Parameters<typeof and>) => dialect.sqlToQuery(and(...filters)!)

  test('a chegada é alcançada pela empresa e pelo id juntos', () => {
    const query = render(buildArrivalFilters({ arrivalId: ARRIVAL_ID, companyId: COMPANY_ID }))
    expect(query.sql).toContain('"cargo_arrivals"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID, ARRIVAL_ID])
  })

  test('as notas da chegada são da empresa e da chegada', () => {
    const query = render(
      buildArrivalDocumentFilters({ arrivalId: ARRIVAL_ID, companyId: COMPANY_ID }),
    )
    expect(query.sql).toContain('"cargo_arrival_documents"."company_id" = $')
    expect(query.sql).toContain('"cargo_arrival_documents"."arrival_id" = $')
  })

  test('a lista começa pela empresa, mesmo sem filtro', () => {
    const query = render(
      buildArrivalListFilters({
        companyId: COMPANY_ID,
        filters: { contractorIds: [], statuses: [] },
        order: { direction: 'desc', sort: 'arrivedAt' },
        paging: { cursor: null, limit: 25 },
      }),
    )
    expect(query.sql).toBe('"cargo_arrivals"."company_id" = $1')
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('vários contratantes, situação e cursor continuam presos à empresa (spec 237, M3)', () => {
    const query = render(
      buildArrivalListFilters({
        companyId: COMPANY_ID,
        filters: { contractorIds: [CONTRACTOR_ID, ARRIVAL_ID], statuses: ['open'] },
        order: { direction: 'asc', sort: 'contractorName' },
        paging: { cursor: { id: ARRIVAL_ID, value: 'Nome' }, limit: 25 },
      }),
    )
    expect(query.sql).toMatch(/^\(+"cargo_arrivals"\."company_id" = \$1\)? and /u)
    expect(query.sql).toContain('"cargo_arrivals"."contractor_id" in ($2, $3)')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('candidatas e disponíveis filtram a nota pela empresa e o emitente pelo CNPJ', () => {
    const candidates = render(
      buildCandidateDocumentFilters({ companyId: COMPANY_ID, documentIds: [ARRIVAL_ID] }),
    )
    expect(candidates.sql).toContain('"nfe_documents"."company_id" = $')
    const available = render(
      buildAvailableDocumentFilters({ companyId: COMPANY_ID, emitterTaxId: '30290856000160' }),
    )
    expect(available.sql).toContain('"nfe_documents"."company_id" = $')
    expect(available.sql).toContain('"cargo_emitter_participant"."tax_id" = $')
    expect(available.sql).toContain('"trip_documents"."released_at" is null')
    expect(available.params).toEqual(expect.arrayContaining([COMPANY_ID, '30290856000160']))
  })
})

describe('isolamento da prévia (spec 237 T4.2)', () => {
  const PREVIEW_ID = '00000000-0000-4000-8000-000000000c04'
  const render = (filters: Parameters<typeof and>) => dialect.sqlToQuery(and(...filters)!)

  test('a prévia é alcançada pela empresa e pelo id juntos', () => {
    const query = render(buildPreviewFilters({ companyId: COMPANY_ID, previewId: PREVIEW_ID }))
    expect(query.sql).toBe(
      '(("cargo_previews"."company_id" = $1) and ("cargo_previews"."id" = $2))',
    )
    expect(query.params).toEqual([COMPANY_ID, PREVIEW_ID])
  })

  test('a lista começa pela empresa, mesmo sem filtro', () => {
    const query = render(
      buildPreviewListFilters({
        companyId: COMPANY_ID,
        filters: {},
        paging: { cursor: null, limit: 25 },
      }),
    )
    expect(query.sql).toBe('"cargo_previews"."company_id" = $1')
  })

  test('os itens são da empresa e da prévia, com qualquer filtro', () => {
    const query = render(
      buildPreviewItemFilters({
        afterRow: 3,
        companyId: COMPANY_ID,
        limit: 10,
        previewId: PREVIEW_ID,
        state: 'matched',
      }),
    )
    expect(query.sql).toContain('"cargo_preview_items"."company_id" = $1')
    expect(query.sql).toContain('"cargo_preview_items"."preview_id" = $2')
    expect(query.params.slice(0, 2)).toEqual([COMPANY_ID, PREVIEW_ID])
  })
})
