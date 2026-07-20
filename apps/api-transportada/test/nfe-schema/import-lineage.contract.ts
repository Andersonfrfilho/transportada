import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { indexDefinitionsByName } from './support.js'
import { requireSchemaTable } from './tables.js'

describe('NF-e import item lineage schema', () => {
  test('preserves one immutable and non-branching predecessor for every retry', () => {
    const nfeImportItems = requireSchemaTable('nfeImportItems')

    expect(columnNames(nfeImportItems)).toContainAllValues([
      'previous_item_id',
      'previous_attempt',
      'attempt',
    ])
    expect(columnSqlTypes(nfeImportItems)).toMatchObject({
      previous_attempt: 'bigint',
      attempt: 'bigint',
    })
    expect(requiredColumnNames(nfeImportItems)).not.toContain('previous_item_id')
    expect(requiredColumnNames(nfeImportItems)).not.toContain('previous_attempt')
    expect(uniqueColumnsByName(nfeImportItems)).toMatchObject({
      nfe_import_items_lineage_target_unique: [
        'company_id',
        'id',
        'source_object_id',
        'source_sha256',
        'source_entry',
        'attempt',
      ],
    })
    expect(foreignKeys(nfeImportItems)).toContainEqual({
      columns: [
        'company_id',
        'previous_item_id',
        'source_object_id',
        'source_sha256',
        'source_entry',
        'previous_attempt',
      ],
      foreignColumns: [
        'company_id',
        'id',
        'source_object_id',
        'source_sha256',
        'source_entry',
        'attempt',
      ],
      foreignTable: 'nfe_import_items',
      name: 'nfe_import_items_lineage_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(
      foreignKeys(nfeImportItems).some(
        ({ columns, foreignColumns, foreignTable }) =>
          columns.join(',') === 'company_id,previous_item_id' &&
          foreignColumns.join(',') === 'company_id,id' &&
          foreignTable === 'nfe_import_items',
      ),
    ).toBeFalse()
    expect(checkSqlByName(nfeImportItems)).toMatchObject({
      nfe_import_items_attempt_history_check: `("nfe_import_items"."attempt" = 1 and "nfe_import_items"."previous_item_id" is null and "nfe_import_items"."previous_attempt" is null) or ("nfe_import_items"."attempt" > 1 and "nfe_import_items"."previous_item_id" is not null and "nfe_import_items"."previous_attempt" is not null and "nfe_import_items"."attempt" = "nfe_import_items"."previous_attempt" + 1)`,
      nfe_import_items_previous_item_check: `"nfe_import_items"."previous_item_id" is null or "nfe_import_items"."previous_item_id" <> "nfe_import_items"."id"`,
    })
    expect(indexDefinitionsByName(nfeImportItems)).toMatchObject({
      nfe_import_items_company_previous_item_unique: {
        columns: ['company_id', 'previous_item_id'],
        isUnique: true,
        where: `"nfe_import_items"."previous_item_id" is not null`,
      },
    })
  })
})
