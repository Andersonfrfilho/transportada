/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { COMPANY_LOGO_MAX_BYTES, companyLogos } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectRequiredUtcTimestamps,
  foreignKeys,
  requiredColumnNames,
} from './support.js'

describe('company logo schema', () => {
  test('stores one brand image per tenant, keyed by company', () => {
    expect(getTableConfig(companyLogos).name).toBe('company_logos')

    expect(columnNames(companyLogos)).toEqual([
      'company_id',
      'mime_type',
      'content_base64',
      'byte_size',
      'sha256',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(companyLogos)).toMatchObject({
      byte_size: 'integer',
      company_id: 'uuid',
      content_base64: 'text',
      mime_type: 'text',
      sha256: 'text',
    })
    expect(requiredColumnNames(companyLogos)).toEqual(columnNames(companyLogos))
    expectRequiredUtcTimestamps(companyLogos)

    const companyId = getTableConfig(companyLogos).columns.find(
      (column) => column.name === 'company_id',
    )
    expect(companyId?.primary).toBeTrue()

    expect(foreignKeys(companyLogos)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_logos_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('rejects formats the pdf renderer cannot draw and images beyond the policy size', () => {
    const checks = checkSqlByName(companyLogos)

    expect(checks.company_logos_mime_type_check).toContain("in ('image/jpeg', 'image/png')")
    expect(checks.company_logos_byte_size_check).toContain(
      `between 1 and ${COMPANY_LOGO_MAX_BYTES}`,
    )
    expect(checks.company_logos_sha256_check).toContain('^[0-9a-f]{64}$')
  })
})
