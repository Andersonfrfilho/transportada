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

describe('normalized NF-e document schema', () => {
  test('preserves document identity, decimal values, and immutable XML references per tenant', () => {
    const nfeDocuments = requireSchemaTable('nfeDocuments')

    expect(columnNames(nfeDocuments)).toContainAllValues([
      'id',
      'company_id',
      'access_key',
      'model',
      'number',
      'series',
      'operation_nature',
      'operation_type',
      'status',
      'source',
      'issued_at',
      'total_value',
      'products_value',
      'freight_value',
      'insurance_value',
      'discount_value',
      'other_expenses_value',
      'additional_information',
      'authorization_protocol',
      'xml_object_id',
      'xml_sha256',
      'import_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(nfeDocuments)).toMatchObject({
      total_value: 'numeric(19, 4)',
      products_value: 'numeric(19, 4)',
      freight_value: 'numeric(19, 4)',
      insurance_value: 'numeric(19, 4)',
      discount_value: 'numeric(19, 4)',
      other_expenses_value: 'numeric(19, 4)',
    })
    expectGeneratedUuidPrimaryKey(nfeDocuments)
    expect(requiredColumnNames(nfeDocuments)).toContainAllValues([
      'id',
      'company_id',
      'access_key',
      'model',
      'number',
      'series',
      'issued_at',
      'operation_nature',
      'operation_type',
      'status',
      'source',
      'total_value',
      'products_value',
      'xml_object_id',
      'xml_sha256',
      'import_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(nfeDocuments)).toMatchObject({
      nfe_documents_company_id_id_unique: ['company_id', 'id'],
      nfe_documents_company_id_access_key_unique: ['company_id', 'access_key'],
    })
    expect(checkSqlByName(nfeDocuments)).toMatchObject({
      nfe_documents_access_key_check: `"nfe_documents"."access_key" ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
      nfe_documents_model_check: `"nfe_documents"."model" = '55'`,
      nfe_documents_number_check: `"nfe_documents"."number" ~ '^[0-9]{1,9}$'`,
      nfe_documents_series_check: `"nfe_documents"."series" ~ '^[0-9]{1,3}$'`,
      nfe_documents_operation_type_check: `"nfe_documents"."operation_type" in ('0', '1')`,
      nfe_documents_status_check: `"nfe_documents"."status" in ('authorized', 'cancelled', 'denied', 'unsigned')`,
      nfe_documents_authorization_protocol_presence_check: `("nfe_documents"."status" = 'unsigned') or ("nfe_documents"."authorization_protocol" is not null)`,
      nfe_documents_source_check: `"nfe_documents"."source" in ('upload', 'distribution')`,
      nfe_documents_values_check: `"nfe_documents"."total_value" >= 0 and "nfe_documents"."products_value" >= 0 and "nfe_documents"."freight_value" >= 0 and "nfe_documents"."insurance_value" >= 0 and "nfe_documents"."discount_value" >= 0 and "nfe_documents"."other_expenses_value" >= 0`,
      nfe_documents_sha256_check: `"nfe_documents"."xml_sha256" ~ '^[0-9a-f]{64}$'`,
    })
    expect(columnNames(nfeDocuments).filter((columnName) => columnName.includes('xml'))).toEqual([
      'xml_object_id',
      'xml_sha256',
    ])
    expect(foreignKeys(nfeDocuments)).toContainEqual({
      columns: ['company_id', 'xml_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'nfe_documents_company_xml_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(nfeDocuments)).toContainEqual({
      columns: ['company_id', 'import_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_imports',
      name: 'nfe_documents_company_import_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
