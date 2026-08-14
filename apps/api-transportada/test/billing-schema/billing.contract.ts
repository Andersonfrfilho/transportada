import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
  uniqueIndexWhereSqlByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('billing schema', () => {
  test('defines immutable invoices with tenant-scoped numbering, idempotency, and decimal totals', () => {
    const billingInvoices = requireSchemaTable('billingInvoices')

    expect(columnNames(billingInvoices)).toContainAllValues([
      'id',
      'company_id',
      'invoice_number',
      'status',
      'customer_name',
      'customer_document',
      'issue_date',
      'due_date',
      'currency',
      'subtotal_amount',
      'discount_amount',
      'surcharge_amount',
      'total_amount',
      'idempotency_key',
      'request_fingerprint',
      'actor_user_id',
      'correlation_id',
      'cancelled_at',
      'observations',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(billingInvoices)
    expect(requiredColumnNames(billingInvoices)).toContainAllValues([
      'id',
      'company_id',
      'invoice_number',
      'status',
      'customer_name',
      'customer_document',
      'issue_date',
      'due_date',
      'currency',
      'subtotal_amount',
      'discount_amount',
      'surcharge_amount',
      'total_amount',
      'idempotency_key',
      'request_fingerprint',
      'actor_user_id',
      'correlation_id',
      'observations',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(billingInvoices)).toMatchObject({
      discount_amount: 'numeric(14, 2)',
      subtotal_amount: 'numeric(14, 2)',
      surcharge_amount: 'numeric(14, 2)',
      total_amount: 'numeric(14, 2)',
    })
    expect(uniqueColumnsByName(billingInvoices)).toMatchObject({
      billing_invoices_company_id_id_unique: ['company_id', 'id'],
      billing_invoices_company_invoice_number_unique: ['company_id', 'invoice_number'],
      billing_invoices_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(indexColumnsByName(billingInvoices)).toMatchObject({
      billing_invoices_company_status_due_date_idx: ['company_id', 'status', 'due_date'],
      billing_invoices_company_customer_created_at_idx: [
        'company_id',
        'customer_document',
        'created_at',
      ],
    })
    expect(checkSqlByName(billingInvoices)).toMatchObject({
      billing_invoices_status_check: '"billing_invoices"."status" in (\'issued\', \'cancelled\')',
      billing_invoices_currency_check: '"billing_invoices"."currency" = \'BRL\'',
      billing_invoices_invoice_number_check: '"billing_invoices"."invoice_number" > 0',
      billing_invoices_amounts_check:
        '"billing_invoices"."subtotal_amount" >= 0 and "billing_invoices"."discount_amount" >= 0 and "billing_invoices"."surcharge_amount" >= 0 and "billing_invoices"."total_amount" >= 0',
      billing_invoices_total_check:
        '"billing_invoices"."total_amount" = ("billing_invoices"."subtotal_amount" - "billing_invoices"."discount_amount" + "billing_invoices"."surcharge_amount")',
      billing_invoices_idempotency_key_check: 'length("billing_invoices"."idempotency_key") > 0',
      billing_invoices_request_fingerprint_check:
        'length("billing_invoices"."request_fingerprint") > 0',
      billing_invoices_customer_document_check:
        '"billing_invoices"."customer_document" ~ \'^[0-9]{11,14}$|^[A-Z0-9]{12}[0-9]{2}$\'',
      billing_invoices_observations_check: 'length("billing_invoices"."observations") <= 500',
    })
    expect(foreignKeys(billingInvoices)).toContainEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'billing_invoices_actor_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('defines invoice items linked to authorized CT-e documents without duplicating active billing', () => {
    const billingInvoiceItems = requireSchemaTable('billingInvoiceItems')

    expect(columnNames(billingInvoiceItems)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'cte_document_id',
      'batch_id',
      'batch_item_id',
      'line_number',
      'cte_access_key',
      'cte_number',
      'description',
      'freight_amount',
      'total_amount',
      'snapshot',
      'cancelled_at',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(billingInvoiceItems)
    expect(requiredColumnNames(billingInvoiceItems)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'cte_document_id',
      'batch_id',
      'batch_item_id',
      'line_number',
      'cte_access_key',
      'cte_number',
      'description',
      'freight_amount',
      'total_amount',
      'snapshot',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(billingInvoiceItems)).toMatchObject({
      cancelled_at: 'timestamp with time zone',
      cte_number: 'bigint',
      freight_amount: 'numeric(14, 2)',
      total_amount: 'numeric(14, 2)',
    })
    expect(requiredColumnNames(billingInvoiceItems)).not.toContain('cancelled_at')
    expect(uniqueColumnsByName(billingInvoiceItems)).toMatchObject({
      billing_invoice_items_company_id_id_unique: ['company_id', 'id'],
      billing_invoice_items_company_invoice_line_unique: [
        'company_id',
        'invoice_id',
        'line_number',
      ],
    })
    expect(Object.keys(uniqueColumnsByName(billingInvoiceItems))).not.toContain(
      'billing_invoice_items_company_cte_document_unique',
    )
    expect(indexColumnsByName(billingInvoiceItems)).toMatchObject({
      billing_invoice_items_active_cte_document_unique: ['company_id', 'cte_document_id'],
    })
    expect(uniqueIndexWhereSqlByName(billingInvoiceItems)).toMatchObject({
      billing_invoice_items_active_cte_document_unique:
        '"billing_invoice_items"."cancelled_at" is null',
    })
    expect(checkSqlByName(billingInvoiceItems)).toMatchObject({
      billing_invoice_items_line_number_check: '"billing_invoice_items"."line_number" > 0',
      billing_invoice_items_cte_access_key_check:
        '"billing_invoice_items"."cte_access_key" ~ \'^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$\'',
      billing_invoice_items_cte_number_check: '"billing_invoice_items"."cte_number" > 0',
      billing_invoice_items_amounts_check:
        '"billing_invoice_items"."freight_amount" >= 0 and "billing_invoice_items"."total_amount" >= 0',
    })
    expect(foreignKeys(billingInvoiceItems)).toContainEqual({
      columns: ['company_id', 'invoice_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'billing_invoices',
      name: 'billing_invoice_items_company_invoice_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(billingInvoiceItems)).toContainEqual({
      columns: ['company_id', 'cte_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_fiscal_documents',
      name: 'billing_invoice_items_company_cte_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('defines append-only events and generated documents with safe object references', () => {
    const billingInvoiceEvents = requireSchemaTable('billingInvoiceEvents')
    const billingInvoiceDocuments = requireSchemaTable('billingInvoiceDocuments')

    expect(columnNames(billingInvoiceEvents)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'event_name',
      'event_version',
      'actor_user_id',
      'reason',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(billingInvoiceEvents)
    expect(requiredColumnNames(billingInvoiceEvents)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'event_name',
      'event_version',
      'actor_user_id',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expect(checkSqlByName(billingInvoiceEvents)).toMatchObject({
      billing_invoice_events_name_check:
        "\"billing_invoice_events\".\"event_name\" in ('invoice_created', 'invoice_updated', 'invoice_cancelled', 'document_generated', 'document_failed')",
      billing_invoice_events_version_check: '"billing_invoice_events"."event_version" > 0',
    })

    expect(columnNames(billingInvoiceDocuments)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'document_kind',
      'object_id',
      'sha256',
      'mime_type',
      'byte_size',
      'document_version',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(billingInvoiceDocuments)
    expect(requiredColumnNames(billingInvoiceDocuments)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'document_kind',
      'object_id',
      'sha256',
      'mime_type',
      'byte_size',
      'document_version',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(billingInvoiceDocuments)).toMatchObject({
      billing_invoice_documents_company_id_id_unique: ['company_id', 'id'],
      billing_invoice_documents_company_invoice_kind_version_unique: [
        'company_id',
        'invoice_id',
        'document_kind',
        'document_version',
      ],
    })
    expect(checkSqlByName(billingInvoiceDocuments)).toMatchObject({
      billing_invoice_documents_kind_check:
        "\"billing_invoice_documents\".\"document_kind\" in ('pdf', 'csv', 'json')",
      billing_invoice_documents_sha256_check:
        '"billing_invoice_documents"."sha256" ~ \'^[0-9a-f]{64}$\'',
      billing_invoice_documents_byte_size_check: '"billing_invoice_documents"."byte_size" > 0',
      billing_invoice_documents_version_check: '"billing_invoice_documents"."document_version" > 0',
    })

    for (const table of [billingInvoiceEvents, billingInvoiceDocuments]) {
      const tableName = getTableConfig(table).name

      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'invoice_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'billing_invoices',
        name: `${tableName}_company_invoice_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
    expect(foreignKeys(billingInvoiceDocuments)).toContainEqual({
      columns: ['company_id', 'object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'billing_invoice_documents_company_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
