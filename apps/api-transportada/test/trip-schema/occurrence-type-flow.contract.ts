/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B5: `company_occurrence_types` ganha `flow` (`document | stop`), e
 * `trip_stop_occurrences` ganha a FK para o tipo — o vocabulário fixo de "Deu problema" migra para
 * o catálogo.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyOccurrenceTypes, tripStopOccurrences } from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

describe('vocabulário de ocorrência de parada migra para o catálogo (spec 218 RF-B5)', () => {
  test('todo tipo nasce com flow "document" por padrão', () => {
    const { columns } = getTableConfig(companyOccurrenceTypes)
    const flow = columns.find((column) => column.name === 'flow')

    expect(flow?.default).toBe('document')
  })

  test('ancora o tipo de parada da ocorrência ao tenant, composto com a empresa', () => {
    expect(foreignKeys(tripStopOccurrences)).toContainEqual({
      columns: ['company_id', 'occurrence_type_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'company_occurrence_types',
      name: 'trip_stop_occurrences_company_occurrence_type_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
