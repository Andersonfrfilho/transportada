/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  MAIL_TEMPLATE_CATALOG,
} from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  contractorMailTemplates,
} from '../../src/database/database.schema.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261016165917_occurrence_mail_template/',
  import.meta.url,
)

const TABLES = [
  {
    foreignKey: 'company_occurrence_types_mail_template_fk',
    index: 'company_occurrence_types_mail_template_idx',
    table: companyOccurrenceTypes,
  },
  {
    foreignKey: 'occurrence_type_contractor_overrides_mail_template_fk',
    index: 'occurrence_type_contractor_overrides_mail_template_idx',
    table: companyOccurrenceTypeContractorOverrides,
  },
] as const

describe('spec 269: o modelo de e-mail do tipo de ocorrência e da exceção por contratante', () => {
  test('occurrence entra depois de address_correction, e o catálogo cobre cada tipo', () => {
    expect(CONTRACTOR_MAIL_TEMPLATE_TYPES).toEqual(['address_correction', 'occurrence'])
    for (const mailType of CONTRACTOR_MAIL_TEMPLATE_TYPES) {
      expect(MAIL_TEMPLATE_CATALOG[mailType].label.length).toBeGreaterThan(0)
    }
  })

  test('a CHECK do tipo de e-mail aceita os dois tipos', () => {
    const checks = getTableConfig(contractorMailTemplates).checks
    expect(checks.map((check) => check.name)).toContain('contractor_mail_templates_mail_type_check')
  })

  for (const { foreignKey, index, table } of TABLES) {
    const config = getTableConfig(table)

    test(`${config.name}: coluna nula, FK composta restrict e índice parcial`, () => {
      const column = config.columns.find(
        (candidate) => candidate.name === 'contractor_mail_template_id',
      )
      expect(column?.notNull).toBe(false)
      expect(column?.hasDefault).toBe(false)
      const fk = config.foreignKeys.find((candidate) => candidate.getName() === foreignKey)
      expect(fk?.reference().columns.map((candidate) => candidate.name)).toEqual([
        'company_id',
        'contractor_mail_template_id',
      ])
      expect(fk?.onDelete).toBe('restrict')
      expect(config.indexes.map((candidate) => candidate.config.name)).toContain(index)
    })
  }

  test('a migration é aditiva e não faz backfill', () => {
    const sql = readFileSync(new URL('migration.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain('ADD COLUMN "contractor_mail_template_id" uuid')
    expect(sql).toContain("CHECK (\"mail_type\" in ('address_correction', 'occurrence'))")
    expect(sql).not.toMatch(/^(UPDATE|DELETE)\s|DROP COLUMN|DROP TABLE/mu)
  })

  test('o rollback devolve a CHECK como NOT VALID e limpa o journal', () => {
    const sql = readFileSync(new URL('rollback.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain('CHECK ("mail_type" in (\'address_correction\')) NOT VALID')
    expect(sql).toContain('DROP COLUMN "contractor_mail_template_id"')
    expect(sql).toContain('20261016165917_occurrence_mail_template')
  })
})
