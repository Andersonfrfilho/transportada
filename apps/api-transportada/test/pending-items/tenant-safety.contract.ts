/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildFleetBodyTypePendingItemFilters } from '../../src/pending-items/infrastructure/drizzle-fleet-body-type-pending-item.source.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000811'
const CURSOR = {
  createdAt: new Date('2026-09-12T10:00:00.000Z'),
  id: '00000000-0000-4000-8000-000000000812',
}

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('pending items fleet body type query tenant safety', () => {
  test('scopes the page by company even without a cursor', () => {
    const query = toSql(
      buildFleetBodyTypePendingItemFilters({ companyId: COMPANY_ID, cursor: null }),
    )

    expect(query.sql).toContain('"fleet_vehicles"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('keeps the company filter beside the cursor', () => {
    const query = toSql(
      buildFleetBodyTypePendingItemFilters({ companyId: COMPANY_ID, cursor: CURSOR }),
    )

    expect(query.sql).toContain('"fleet_vehicles"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** Spec 147 D2: só o tipo que carrega, com `00`, e ativo — a carreta entra sem valor próprio. */
  test('excludes the tractor unit, requires body type 00 and only active vehicles', () => {
    const query = toSql(
      buildFleetBodyTypePendingItemFilters({ companyId: COMPANY_ID, cursor: null }),
    )

    expect(query.sql).toContain('"fleet_vehicles"."vehicle_type" <> $')
    expect(query.sql).toContain('"fleet_vehicles"."body_type" = $')
    expect(query.sql).toContain('"fleet_vehicles"."status" = $')
    expect(query.params).toEqual([COMPANY_ID, 'tractor_unit', '00', 'active'])
  })
})
