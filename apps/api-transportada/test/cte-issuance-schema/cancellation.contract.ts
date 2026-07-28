/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_ISSUANCE_EVENTS,
  CTE_ISSUANCE_OUTBOX_ATTEMPT_KINDS,
  CTE_ISSUANCE_OUTBOX_EVENT_TYPES,
  cteIssuanceOutbox,
} from '../../src/database/cte-issuance.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  requiredColumnNames,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

const CANCELLATION_COLUMNS = [
  'cancellation_justification',
  'cancellation_protocol',
  'cancellation_requested_at',
  'cancellation_xml_object_id',
  'cancellation_xml_sha256',
  'cancelled_at',
] as const

describe('CT-e fiscal cancellation schema', () => {
  test('keeps the cancellation state on the fiscal document of the item', () => {
    const cteFiscalDocuments = requireSchemaTable('cteFiscalDocuments')
    const names = columnNames(cteFiscalDocuments)

    for (const columnName of CANCELLATION_COLUMNS) {
      expect(names).toContain(columnName)
    }
  })

  test('leaves every cancellation column nullable so the write-back never fails after SEFAZ', () => {
    const required = requiredColumnNames(requireSchemaTable('cteFiscalDocuments'))

    for (const columnName of CANCELLATION_COLUMNS) {
      expect(required).not.toContain(columnName)
    }
  })

  test('binds the cancelled state to protocol, justification and paired xml columns', () => {
    const cteFiscalDocuments = requireSchemaTable('cteFiscalDocuments')

    expect(checkSqlByName(cteFiscalDocuments)).toMatchObject({
      cte_fiscal_documents_cancellation_justification_check:
        '"cte_fiscal_documents"."cancellation_justification" is null or length("cte_fiscal_documents"."cancellation_justification") >= 15',
      cte_fiscal_documents_cancellation_sha256_check:
        '"cte_fiscal_documents"."cancellation_xml_sha256" is null or "cte_fiscal_documents"."cancellation_xml_sha256" ~ \'^[0-9a-f]{64}$\'',
      cte_fiscal_documents_cancellation_xml_check:
        '("cte_fiscal_documents"."cancellation_xml_object_id" is null) = ("cte_fiscal_documents"."cancellation_xml_sha256" is null)',
      cte_fiscal_documents_cancelled_state_check:
        '"cte_fiscal_documents"."status" <> \'cancelled\' or ("cte_fiscal_documents"."cancellation_protocol" is not null and "cte_fiscal_documents"."cancellation_justification" is not null and "cte_fiscal_documents"."cancelled_at" is not null)',
    })
  })

  test('stores the cancellation event xml as a tenant-scoped stored object', () => {
    const cteFiscalDocuments = requireSchemaTable('cteFiscalDocuments')

    expect(foreignKeys(cteFiscalDocuments)).toContainEqual({
      columns: ['company_id', 'cancellation_xml_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'cte_fiscal_documents_company_cancellation_xml_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('admits the cancel request in the issuance event, outbox kind and outbox type vocabularies', () => {
    expect(CTE_ISSUANCE_EVENTS).toContain('cancel_requested')
    expect(CTE_ISSUANCE_OUTBOX_ATTEMPT_KINDS).toContain('cancel')
    expect(CTE_ISSUANCE_OUTBOX_EVENT_TYPES).toContain('transportada.cte.item.cancel.requested')

    expect(checkSqlByName(requireSchemaTable('cteIssuanceEvents'))).toMatchObject({
      cte_issuance_events_name_check:
        "\"cte_issuance_events\".\"event_name\" in ('issue_requested', 'cancel_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled')",
    })
  })

  test('lets the cancel command travel through the same issuance outbox', () => {
    expect(checkSqlByName(cteIssuanceOutbox)).toMatchObject({
      cte_issuance_outbox_attempt_kind_check:
        "\"cte_issuance_outbox\".\"attempt_kind\" in ('issue', 'reprocess', 'cancel')",
      cte_issuance_outbox_event_type_check:
        '"cte_issuance_outbox"."event_type" in (\'transportada.cte.item.issue.requested\', \'transportada.cte.item.cancel.requested\')',
    })
  })
})
