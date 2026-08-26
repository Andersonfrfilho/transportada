/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { landingSettings } from '../../src/database/database.schema.js'
import { checkSqlByName, columnNames, columnSqlTypes, requiredColumnNames } from './support.js'

describe('landing settings schema', () => {
  test('keys landing configuration by cnpj root, with everything else optional', () => {
    expect(getTableConfig(landingSettings).name).toBe('landing_settings')

    expect(columnNames(landingSettings)).toEqual([
      'cnpj_root',
      'brand_name',
      'contact_email',
      'contact_phone',
      'accent_color',
      'sections',
      'updated_at',
    ])
    expect(columnSqlTypes(landingSettings)).toMatchObject({
      accent_color: 'varchar(7)',
      cnpj_root: 'varchar(8)',
      sections: 'jsonb',
    })
    expect(requiredColumnNames(landingSettings)).toEqual(['cnpj_root', 'sections', 'updated_at'])

    const cnpjRoot = getTableConfig(landingSettings).columns.find(
      (column) => column.name === 'cnpj_root',
    )
    expect(cnpjRoot?.primary).toBeTrue()
  })

  test('rejects a malformed root, a non-hex accent color, and a sections value that is not an object', () => {
    const checks = checkSqlByName(landingSettings)

    expect(checks.landing_settings_cnpj_root_check).toContain('[A-Z0-9]{8}')
    expect(checks.landing_settings_accent_color_check).toContain('^#[0-9a-f]{6}$')
    expect(checks.landing_settings_sections_check).toContain('jsonb_typeof')
  })
})
