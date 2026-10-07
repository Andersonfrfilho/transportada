/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1.1 (RF1, RF3, RF9, D-a): a exigência da ocorrência passa a ser dado. No tipo, a
 * observação nasce `optional` e a assinatura `off`, nunca nulas; nas duas exceções as mesmas
 * colunas são nulas e sem padrão — nulo herda do tipo. A assinatura gravada mora em
 * `signature_object_id`, presa ao objeto da mesma empresa.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripStopOccurrences,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

const POSTGRES_IDENTIFIER_LIMIT = 63
const NOTE_MODE = 'note_mode'
const SIGNATURE_MODE = 'signature_mode'
const SIGNATURE_OBJECT_ID = 'signature_object_id'

type SchemaTable = Parameters<typeof getTableConfig>[0]

function describeColumn(table: SchemaTable, name: string) {
  const column = getTableConfig(table).columns.find((candidate) => candidate.name === name)
  if (column === undefined) return undefined
  return { default: column.default, notNull: column.notNull }
}

function checkNames(table: SchemaTable): readonly string[] {
  return getTableConfig(table).checks.map((check) => check.name)
}

describe('exigência de observação e assinatura no tipo de ocorrência (spec 246 T1.1)', () => {
  test('o tipo nasce com observação optional e assinatura off, nunca nulas', () => {
    expect(describeColumn(companyOccurrenceTypes, NOTE_MODE)).toEqual({
      default: 'optional',
      notNull: true,
    })
    expect(describeColumn(companyOccurrenceTypes, SIGNATURE_MODE)).toEqual({
      default: 'off',
      notNull: true,
    })
  })

  test('o vocabulário do tipo é preso por CHECK nomeada', () => {
    expect(checkNames(companyOccurrenceTypes)).toEqual(
      expect.arrayContaining([
        'company_occurrence_types_note_mode_check',
        'company_occurrence_types_signature_mode_check',
      ]),
    )
  })

  for (const table of [
    companyOccurrenceTypeContractorOverrides,
    companyOccurrenceTypeRecipientOverrides,
  ]) {
    const tableName = getTableConfig(table).name

    test(`${tableName}: as colunas novas são nulas e sem padrão (D-a, nulo herda)`, () => {
      expect(describeColumn(table, NOTE_MODE)).toEqual({ default: undefined, notNull: false })
      expect(describeColumn(table, SIGNATURE_MODE)).toEqual({ default: undefined, notNull: false })
    })

    test(`${tableName}: CHECKs de vocabulário com nome dentro de 63 caracteres`, () => {
      const names = checkNames(table).filter(
        (name) => name.includes(NOTE_MODE) || name.includes(SIGNATURE_MODE),
      )
      expect(names).toHaveLength(2)
      for (const name of names) expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_LIMIT)
    })
  }
})

describe('a assinatura gravada na ocorrência (spec 246 T1.1, RF9)', () => {
  for (const table of [tripDocumentOccurrences, tripStopOccurrences]) {
    const tableName = getTableConfig(table).name

    test(`${tableName}: signature_object_id nula, presa ao objeto da mesma empresa`, () => {
      expect(describeColumn(table, SIGNATURE_OBJECT_ID)).toEqual({
        default: undefined,
        notNull: false,
      })
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', SIGNATURE_OBJECT_ID],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'stored_objects',
        name: `${tableName}_company_signature_object_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    })
  }
})
