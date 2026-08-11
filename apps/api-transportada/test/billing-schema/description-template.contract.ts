import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
  uniqueColumnsByName,
  uniqueIndexWhereSqlByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('billing description template schema', () => {
  test('defines a tenant-scoped catalog with unique names', () => {
    const templates = requireSchemaTable('billingDescriptionTemplates')

    expect(columnNames(templates)).toContainAllValues([
      'id',
      'company_id',
      'name',
      'body',
      'is_default',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(templates)
    expectRequiredUtcTimestamps(templates)
    expect(requiredColumnNames(templates)).toContainAllValues([
      'id',
      'company_id',
      'name',
      'body',
      'is_default',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(templates)).toMatchObject({
      billing_description_templates_company_id_id_unique: ['company_id', 'id'],
      billing_description_templates_company_name_unique: ['company_id', 'name'],
    })
  })

  test('allows at most one default template per company', () => {
    const templates = requireSchemaTable('billingDescriptionTemplates')

    expect(uniqueIndexWhereSqlByName(templates)).toMatchObject({
      billing_description_templates_company_default_unique:
        '"billing_description_templates"."is_default"',
    })
  })

  test('bounds the name and keeps the body within the printed observations budget', () => {
    const templates = requireSchemaTable('billingDescriptionTemplates')

    expect(checkSqlByName(templates)).toMatchObject({
      billing_description_templates_name_check:
        'length(btrim("billing_description_templates"."name")) between 1 and 120',
      billing_description_templates_body_check:
        'length("billing_description_templates"."body") between 1 and 500',
    })
  })
})
