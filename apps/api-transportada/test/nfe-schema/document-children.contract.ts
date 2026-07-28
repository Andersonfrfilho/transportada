import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('normalized NF-e document children schema', () => {
  test('normalizes participants and addresses through tenant-composite relationships', () => {
    const nfeParticipants = requireSchemaTable('nfeParticipants')
    const nfeAddresses = requireSchemaTable('nfeAddresses')

    expect(columnNames(nfeParticipants)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'role',
      'tax_id',
      'legal_name',
      'state_registration',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeParticipants)
    expect(requiredColumnNames(nfeParticipants)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'role',
      'created_at',
    ])
    expect(uniqueColumnsByName(nfeParticipants)).toMatchObject({
      nfe_participants_company_id_id_unique: ['company_id', 'id'],
      nfe_participants_company_document_role_unique: ['company_id', 'document_id', 'role'],
    })
    expect(
      Object.values(uniqueColumnsByName(nfeParticipants)).some(
        (columns) => columns.join(',') === 'company_id,document_id,role,tax_id',
      ),
    ).toBeFalse()
    expect(foreignKeys(nfeParticipants)).toContainEqual({
      columns: ['company_id', 'document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_documents',
      name: 'nfe_participants_company_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(columnNames(nfeAddresses)).toContainAllValues([
      'id',
      'company_id',
      'participant_id',
      'street',
      'number',
      'complement',
      'district',
      'city_code',
      'city',
      'state',
      'postal_code',
      'country_code',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeAddresses)
    expect(requiredColumnNames(nfeAddresses)).toContainAllValues([
      'id',
      'company_id',
      'participant_id',
      'created_at',
    ])
    expect(foreignKeys(nfeAddresses)).toContainEqual({
      columns: ['company_id', 'participant_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_participants',
      name: 'nfe_addresses_company_participant_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('uses decimal columns for every persisted quantity, weight, and product value', () => {
    const nfeVolumes = requireSchemaTable('nfeVolumes')
    const nfeProducts = requireSchemaTable('nfeProducts')

    expect(columnNames(nfeVolumes)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'ordinal',
      'quantity',
      'species',
      'gross_weight',
      'net_weight',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeVolumes)
    expect(requiredColumnNames(nfeVolumes)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'ordinal',
      'created_at',
    ])
    expect(columnSqlTypes(nfeVolumes)).toMatchObject({
      quantity: 'numeric(19, 4)',
      gross_weight: 'numeric(19, 4)',
      net_weight: 'numeric(19, 4)',
    })
    expect(columnNames(nfeProducts)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'ordinal',
      'code',
      'description',
      'ncm',
      'cfop',
      'commercial_unit',
      'quantity',
      'unit_value',
      'total_value',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeProducts)
    expect(requiredColumnNames(nfeProducts)).toContainAllValues([
      'id',
      'company_id',
      'document_id',
      'ordinal',
      'code',
      'description',
      'ncm',
      'cfop',
      'commercial_unit',
      'quantity',
      'unit_value',
      'total_value',
      'created_at',
    ])
    expect(columnSqlTypes(nfeProducts)).toMatchObject({
      quantity: 'numeric(19, 4)',
      unit_value: 'numeric(19, 4)',
      total_value: 'numeric(19, 4)',
    })
    expect(checkSqlByName(nfeVolumes)).toMatchObject({
      nfe_volumes_values_check: `"nfe_volumes"."ordinal" > 0 and "nfe_volumes"."quantity" >= 0 and "nfe_volumes"."gross_weight" >= 0 and "nfe_volumes"."net_weight" >= 0`,
    })
    expect(checkSqlByName(nfeProducts)).toMatchObject({
      nfe_products_values_check: `"nfe_products"."ordinal" > 0 and "nfe_products"."quantity" >= 0 and "nfe_products"."unit_value" >= 0 and "nfe_products"."total_value" >= 0`,
    })
    for (const [table, relationName] of [
      [nfeVolumes, 'nfe_volumes_company_document_fk'],
      [nfeProducts, 'nfe_products_company_document_fk'],
    ] as const) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'document_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'nfe_documents',
        name: relationName,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })
})
