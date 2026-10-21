/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.1 (ADR-0107): o escopo de contratantes do tipo de ocorrência no schema e na migration.
 */
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  companyOccurrenceTypeContractors,
  companyOccurrenceTypes,
} from '../../src/database/database.schema.js'
import {
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  OCCURRENCE_TYPE_CONTRACTOR_SCOPES,
} from '../../src/shared/trip-occurrence.constant.js'
import {
  OccurrenceTypeContractorScopeEmptyError,
  OccurrenceTypeContractorScopeInvalidError,
  OccurrenceTypeContractorScopeNeedsDocumentError,
  OccurrenceTypeNotAvailableForContractorError,
} from '../../src/trips/domain/occurrence-type-contractor-scope.error.js'

const MIGRATION = new URL(
  '../../drizzle/20261017010529_occurrence_type_contractor_scope/',
  import.meta.url,
)

describe('spec 270: escopo de contratantes do tipo de ocorrência — schema e migration', () => {
  test('a constante tem all e listed, nessa ordem', () => {
    expect(OCCURRENCE_TYPE_CONTRACTOR_SCOPES).toEqual(['all', 'listed'])
    expect(OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all).toBe('all')
  })

  test('a coluna do tipo é NOT NULL, padrão all, com CHECK gerada da constante', () => {
    const config = getTableConfig(companyOccurrenceTypes)
    const column = config.columns.find((candidate) => candidate.name === 'contractor_scope')
    expect(column?.notNull).toBe(true)
    expect(column?.default).toBe('all')
    expect(config.checks.map((check) => check.name)).toContain(
      'company_occurrence_types_contractor_scope_check',
    )
  })

  test('a lista: PK nas três colunas, FK do tipo cascade e da contratante restrict, ambas por empresa', () => {
    const config = getTableConfig(companyOccurrenceTypeContractors)
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'company_id',
      'occurrence_type_id',
      'contractor_id',
    ])
    const byName = new Map(config.foreignKeys.map((fk) => [fk.getName(), fk]))
    const typeFk = byName.get('company_occurrence_type_contractors_type_fk')
    const contractorFk = byName.get('company_occurrence_type_contractors_contractor_fk')
    expect(typeFk?.onDelete).toBe('cascade')
    expect(typeFk?.reference().columns.map((column) => column.name)).toEqual([
      'company_id',
      'occurrence_type_id',
    ])
    expect(contractorFk?.onDelete).toBe('restrict')
    expect(contractorFk?.reference().columns.map((column) => column.name)).toEqual([
      'company_id',
      'contractor_id',
    ])
  })

  test('a migration é aditiva e o rollback desfaz tudo e tira a própria linha do diário', () => {
    const migration = readFileSync(new URL('migration.sql', MIGRATION), 'utf8')
    const rollback = readFileSync(new URL('rollback.sql', MIGRATION), 'utf8')
    expect(migration).not.toMatch(
      /\bdrop\s+(table|column|index|constraint)\b|^\s*(delete|truncate)\b/im,
    )
    expect(migration).toContain("DEFAULT 'all' NOT NULL")
    expect(rollback).toContain('DROP TABLE "company_occurrence_type_contractors"')
    expect(rollback).toContain('DROP COLUMN "contractor_scope"')
    expect(rollback).toContain('20261017010529_occurrence_type_contractor_scope')
  })

  test('os erros têm código estável e status', () => {
    expect(
      [
        new OccurrenceTypeContractorScopeEmptyError(),
        new OccurrenceTypeContractorScopeNeedsDocumentError(),
        new OccurrenceTypeContractorScopeInvalidError(),
        new OccurrenceTypeNotAvailableForContractorError(),
      ].map((error) => [error.code, error.status]),
    ).toEqual([
      ['OCCURRENCE_TYPE_CONTRACTOR_SCOPE_EMPTY', 400],
      ['OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT', 400],
      ['OCCURRENCE_TYPE_CONTRACTOR_SCOPE_INVALID', 400],
      ['OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR', 422],
    ])
  })

  test('a recusa do lote leva só os ids das notas', () => {
    const error = new OccurrenceTypeNotAvailableForContractorError(['doc-1', 'doc-2'])
    expect(error.details).toEqual([
      { field: 'documentIds', message: 'doc-1' },
      { field: 'documentIds', message: 'doc-2' },
    ])
  })
})
