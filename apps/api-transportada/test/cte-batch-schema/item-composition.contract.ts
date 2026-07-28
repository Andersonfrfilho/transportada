import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

const columnType = (tableName: 'cteBatchItemCharges' | 'cteBatchItemDocuments', column: string) =>
  getTableConfig(requireSchemaTable(tableName))
    .columns.find((candidate) => candidate.name === column)
    ?.getSQLType()

describe('CT-e batch item composition schema', () => {
  test('links many NF-e documents to a single projected CT-e item', () => {
    const cteBatchItemDocuments = requireSchemaTable('cteBatchItemDocuments')

    expect(columnNames(cteBatchItemDocuments)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'item_id',
      'nfe_document_id',
      'position',
      'created_at',
    ])
    expect(requiredColumnNames(cteBatchItemDocuments)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'item_id',
      'nfe_document_id',
      'position',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(cteBatchItemDocuments)

    expect(uniqueColumnsByName(cteBatchItemDocuments)).toMatchObject({
      cte_batch_item_documents_company_id_id_unique: ['company_id', 'id'],
      cte_batch_item_documents_company_batch_nfe_unique: [
        'company_id',
        'batch_id',
        'nfe_document_id',
      ],
      cte_batch_item_documents_company_item_position_unique: ['company_id', 'item_id', 'position'],
    })

    expect(foreignKeys(cteBatchItemDocuments)).toContainEqual({
      columns: ['company_id', 'item_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batch_items',
      name: 'cte_batch_item_documents_company_item_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(cteBatchItemDocuments)).toContainEqual({
      columns: ['company_id', 'batch_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batches',
      name: 'cte_batch_item_documents_company_batch_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(cteBatchItemDocuments)).toContainEqual({
      columns: ['company_id', 'nfe_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_documents',
      name: 'cte_batch_item_documents_company_nfe_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(checkSqlByName(cteBatchItemDocuments)).toMatchObject({
      cte_batch_item_documents_position_check: '"cte_batch_item_documents"."position" > 0',
    })
  })

  test('freezes the charge breakdown of each item as exact decimals', () => {
    const cteBatchItemCharges = requireSchemaTable('cteBatchItemCharges')

    expect(columnNames(cteBatchItemCharges)).toContainAllValues([
      'id',
      'company_id',
      'item_id',
      'ordinal',
      'label',
      'calculation_type',
      'rate',
      'base_amount',
      'amount',
      'created_at',
    ])
    expect(requiredColumnNames(cteBatchItemCharges)).toContainAllValues([
      'id',
      'company_id',
      'item_id',
      'ordinal',
      'label',
      'calculation_type',
      'base_amount',
      'amount',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(cteBatchItemCharges)

    expect(columnType('cteBatchItemCharges', 'amount')).toBe('numeric(19, 4)')
    expect(columnType('cteBatchItemCharges', 'base_amount')).toBe('numeric(19, 4)')
    expect(columnType('cteBatchItemCharges', 'rate')).toBe('numeric(9, 6)')

    expect(uniqueColumnsByName(cteBatchItemCharges)).toMatchObject({
      cte_batch_item_charges_company_id_id_unique: ['company_id', 'id'],
      cte_batch_item_charges_company_item_ordinal_unique: ['company_id', 'item_id', 'ordinal'],
    })
    expect(foreignKeys(cteBatchItemCharges)).toContainEqual({
      columns: ['company_id', 'item_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batch_items',
      name: 'cte_batch_item_charges_company_item_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })

    expect(checkSqlByName(cteBatchItemCharges)).toMatchObject({
      cte_batch_item_charges_calculation_type_check:
        "\"cte_batch_item_charges\".\"calculation_type\" in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')",
      cte_batch_item_charges_value_coherence_check:
        'case when "cte_batch_item_charges"."calculation_type" = \'fixed_amount\' then "cte_batch_item_charges"."rate" is null else "cte_batch_item_charges"."rate" is not null end',
      cte_batch_item_charges_rate_check:
        '"cte_batch_item_charges"."rate" is null or ("cte_batch_item_charges"."rate" >= 0 and "cte_batch_item_charges"."rate" <= 1)',
      cte_batch_item_charges_amount_check: '"cte_batch_item_charges"."amount" >= 0',
      cte_batch_item_charges_base_amount_check: '"cte_batch_item_charges"."base_amount" >= 0',
      cte_batch_item_charges_ordinal_check: '"cte_batch_item_charges"."ordinal" > 0',
      cte_batch_item_charges_label_check: 'length("cte_batch_item_charges"."label") > 0',
    })
  })
})
