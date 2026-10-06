/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9): a ocorrência de recebimento é linha de `trip_document_occurrences`
 * com dono por coluna irmã, e a marcação "devolver ao contratante" é coluna ortogonal da nota da
 * chegada. O banco garante exatamente um dono, a etapa casada com o dono e o motivo desta nota.
 */
import { describe, expect, test } from 'bun:test'

import {
  cargoArrivalDocuments,
  companyOccurrenceTypes,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  foreignKeys,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const RESTRICT = { onDelete: 'restrict', onUpdate: 'cascade' } as const

describe('a ocorrência pertence a exatamente uma nota (spec 237 T3.2)', () => {
  test('nota da viagem ou nota da chegada — nunca as duas, nunca nenhuma', () => {
    const checks = unqualifiedCheckSqlByName(tripDocumentOccurrences)
    expect(checks.trip_document_occurrences_owner_check).toBe(
      'num_nonnulls("trip_document_id", "cargo_arrival_document_id") = 1',
    )
    expect(checks.trip_document_occurrences_receiving_owner_check).toBe(
      `("stage" = 'receiving') = ("cargo_arrival_document_id" is not null)`,
    )
    expect(checks.trip_document_occurrences_stage_check).toBe(
      `"stage" in ('delivery', 'separation', 'receiving')`,
    )
    expect(requiredColumnNames(tripDocumentOccurrences)).not.toContain('trip_document_id')
    expect(requiredColumnNames(tripDocumentOccurrences)).not.toContain('cargo_arrival_document_id')
    expect(columnSqlTypes(tripDocumentOccurrences)).toMatchObject({
      cargo_arrival_document_id: 'uuid',
      trip_document_id: 'uuid',
    })
  })

  test('a nota da chegada é da mesma empresa, e a ocorrência nunca some em cascata', () => {
    expect(foreignKeys(tripDocumentOccurrences)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'cargo_arrival_document_id'],
          foreignColumns: ['company_id', 'id'],
          foreignTable: 'cargo_arrival_documents',
          name: 'trip_document_occurrences_company_arrival_document_fk',
          ...RESTRICT,
        },
      ]),
    )
    expect(uniqueColumnsByName(tripDocumentOccurrences)).toMatchObject({
      trip_document_occurrences_company_arrival_document_id_unique: [
        'company_id',
        'cargo_arrival_document_id',
        'id',
      ],
    })
  })

  test('o tipo de recebimento é etapa própria do cadastro', () => {
    expect(unqualifiedCheckSqlByName(companyOccurrenceTypes)).toMatchObject({
      company_occurrence_types_stage_check: `"stage" in ('delivery', 'separation', 'receiving')`,
    })
  })
})

describe('a marcação "devolver ao contratante" (spec 237 RF8a)', () => {
  test('é coluna ortogonal ao eixo, com o motivo presente só fora de none', () => {
    const checks = unqualifiedCheckSqlByName(cargoArrivalDocuments)
    expect(checks.cargo_arrival_documents_return_to_contractor_check).toBe(
      `"return_to_contractor" in ('marked', 'none', 'returned')`,
    )
    expect(checks.cargo_arrival_documents_return_occurrence_check).toBe(
      `("return_to_contractor" = 'none') = ("return_occurrence_id" is null)`,
    )
    expect(requiredColumnNames(cargoArrivalDocuments)).toContain('return_to_contractor')
    expect(columnSqlTypes(cargoArrivalDocuments)).toMatchObject({
      return_occurrence_id: 'uuid',
      return_to_contractor: 'varchar(16)',
    })
  })

  test('o motivo é uma ocorrência DESTA nota, pelo banco', () => {
    expect(foreignKeys(cargoArrivalDocuments)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'id', 'return_occurrence_id'],
          foreignColumns: ['company_id', 'cargo_arrival_document_id', 'id'],
          foreignTable: 'trip_document_occurrences',
          name: 'cargo_arrival_documents_return_occurrence_fk',
          ...RESTRICT,
        },
      ]),
    )
    expect(uniqueColumnsByName(cargoArrivalDocuments)).toMatchObject({
      cargo_arrival_documents_company_id_id_unique: ['company_id', 'id'],
    })
  })
})
