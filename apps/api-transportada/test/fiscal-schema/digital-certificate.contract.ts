import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from './support.js'
import { digitalCertificates } from './tables.js'

const dialect = new PgDialect()

describe('tenant fiscal schema', () => {
  test('stores only a versioned active or retired certificate envelope', () => {
    expect(columnNames(digitalCertificates)).toEqual([
      'id',
      'company_id',
      'purpose',
      'version',
      'status',
      'secret_envelope',
      'validated_cnpj',
      'valid_from',
      'expires_at',
      'fingerprint',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(digitalCertificates)).toEqual([
      'id',
      'company_id',
      'purpose',
      'version',
      'status',
      'validated_cnpj',
      'valid_from',
      'expires_at',
      'fingerprint',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(digitalCertificates)).toEqual({
      id: 'uuid',
      company_id: 'uuid',
      purpose: 'text',
      version: 'bigint',
      status: 'text',
      secret_envelope: 'jsonb',
      validated_cnpj: 'text',
      valid_from: 'timestamp with time zone',
      expires_at: 'timestamp with time zone',
      fingerprint: 'text',
      created_by_user_id: 'uuid',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(digitalCertificates)
    expect(uniqueColumnsByName(digitalCertificates)).toEqual({
      digital_certificates_company_id_id_unique: ['company_id', 'id'],
      digital_certificates_company_id_purpose_version_unique: ['company_id', 'purpose', 'version'],
    })
    expect(checkSqlByName(digitalCertificates)).toEqual({
      digital_certificates_envelope_status_check: `("digital_certificates"."status" = 'active' and "digital_certificates"."secret_envelope" is not null) or ("digital_certificates"."status" = 'retired' and "digital_certificates"."secret_envelope" is null)`,
      digital_certificates_purpose_check: `"digital_certificates"."purpose" = 'cte'`,
      digital_certificates_status_check: `"digital_certificates"."status" in ('active', 'retired')`,
      digital_certificates_validated_cnpj_check: `"digital_certificates"."validated_cnpj" ~ '^[0-9]{14}$'`,
      digital_certificates_validity_range_check: `"digital_certificates"."valid_from" < "digital_certificates"."expires_at"`,
      digital_certificates_version_check: `"digital_certificates"."version" > 0`,
    })

    for (const validityColumnName of ['valid_from', 'expires_at']) {
      const validityColumn = getTableConfig(digitalCertificates).columns.find(
        (column) => column.name === validityColumnName,
      )
      expect(validityColumn?.hasDefault).toBeFalse()
    }

    const activeUnique = getTableConfig(digitalCertificates).indexes.find(
      (tableIndex) =>
        tableIndex.config.name === 'digital_certificates_company_id_purpose_active_unique',
    )
    expect(activeUnique?.config.unique).toBeTrue()
    expect(
      activeUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'purpose'])
    expect(
      activeUnique?.config.where === undefined
        ? undefined
        : dialect.sqlToQuery(activeUnique.config.where).sql,
    ).toBe(`"digital_certificates"."status" = 'active'`)
    expect(indexColumnsByName(digitalCertificates)).toMatchObject({
      digital_certificates_company_id_created_at_id_idx: ['company_id', 'created_at', 'id'],
    })
  })
})
