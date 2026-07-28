/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeIssuanceOutbox,
  mdfeIssuancePayloads,
  mdfeProcessedMessages,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  indexColumnsByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('mdfe issuance attempt schema', () => {
  test('records every transmission of the manifest with its idempotency identity', () => {
    expect(getTableConfig(mdfeIssuanceAttempts).name).toBe('mdfe_issuance_attempts')
    expectGeneratedUuidPrimaryKey(mdfeIssuanceAttempts)
    expectRequiredUtcTimestamps(mdfeIssuanceAttempts)

    expect(columnNames(mdfeIssuanceAttempts)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'attempt_kind',
      'attempt_number',
      'status',
      'idempotency_key',
      'idempotency_fingerprint',
      'request_fingerprint',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'reservation_id',
      'last_error_code',
      'last_error_cause',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
  })

  test('accepts issuing, closing and cancelling as the only manifest attempts', () => {
    const checks = checkSqlByName(mdfeIssuanceAttempts)

    expect(checks.mdfe_issuance_attempts_kind_check).toContain("in ('issue', 'close', 'cancel')")
    expect(checks.mdfe_issuance_attempts_status_check).toContain("'reconciliation_required'")
    expect(checks.mdfe_issuance_attempts_environment_check).toContain(
      "in ('homologation', 'production')",
    )
    expect(checks.mdfe_issuance_attempts_attempt_number_check).toContain('> 0')
  })

  // Encerramento e cancelamento reaproveitam o número autorizado — só a emissão reserva um novo
  test('reserves a fiscal number exactly on the issuing attempt', () => {
    const check = checkSqlByName(mdfeIssuanceAttempts).mdfe_issuance_attempts_reservation_check

    expect(check).toContain("'issue'")
    expect(check).toContain('is not null')
  })

  test('makes a repeated idempotency key collide inside the tenant', () => {
    expect(uniqueColumnsByName(mdfeIssuanceAttempts)).toMatchObject({
      mdfe_issuance_attempts_company_id_id_unique: ['company_id', 'id'],
      mdfe_issuance_attempts_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
      mdfe_issuance_attempts_company_manifest_kind_fingerprint_unique: [
        'company_id',
        'manifest_id',
        'attempt_kind',
        'request_fingerprint',
      ],
    })
  })
})

describe('mdfe fiscal document schema', () => {
  test('keeps the authorization, the closure and the cancellation of the same manifest', () => {
    expect(getTableConfig(mdfeFiscalDocuments).name).toBe('mdfe_fiscal_documents')
    expectGeneratedUuidPrimaryKey(mdfeFiscalDocuments)
    expectRequiredUtcTimestamps(mdfeFiscalDocuments)

    expect(columnNames(mdfeFiscalDocuments)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'attempt_id',
      'access_key',
      'authorization_protocol',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'status',
      'xml_object_id',
      'xml_sha256',
      'authorized_at',
      'closure_protocol',
      'closure_state',
      'closure_city_code',
      'closure_xml_object_id',
      'closure_xml_sha256',
      'closed_at',
      'cancellation_justification',
      'cancellation_requested_at',
      'cancellation_protocol',
      'cancellation_xml_object_id',
      'cancellation_xml_sha256',
      'cancelled_at',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(mdfeFiscalDocuments)).toMatchObject({
      fiscal_number: 'bigint',
      xml_object_id: 'uuid',
    })
  })

  test('validates the 44 digit key and the stored xml digest', () => {
    const checks = checkSqlByName(mdfeFiscalDocuments)

    expect(checks.mdfe_fiscal_documents_access_key_check).toContain("~ '^[0-9]{44}$'")
    expect(checks.mdfe_fiscal_documents_sha256_check).toContain("~ '^[0-9a-f]{64}$'")
    expect(checks.mdfe_fiscal_documents_status_check).toContain(
      "in ('authorized', 'closed', 'cancelled')",
    )
  })

  test('demands the whole closure group of the 110112 event', () => {
    const checks = checkSqlByName(mdfeFiscalDocuments)

    expect(checks.mdfe_fiscal_documents_closed_state_check).toContain("'closed'")
    expect(checks.mdfe_fiscal_documents_closure_city_code_check).toContain("~ '^[0-9]{7}$'")
    expect(checks.mdfe_fiscal_documents_closure_state_check).toContain("~ '^[A-Z]{2}$'")
    expect(checks.mdfe_fiscal_documents_closure_xml_check).toContain('is null')
  })

  test('demands the protocol and a justification of at least fifteen characters to cancel', () => {
    const checks = checkSqlByName(mdfeFiscalDocuments)

    expect(checks.mdfe_fiscal_documents_cancelled_state_check).toContain("'cancelled'")
    expect(checks.mdfe_fiscal_documents_cancellation_justification_check).toContain('>= 15')
  })

  // Cancelamento depois do encerramento é rejeitado pela SEFAZ — o banco não guarda esse estado
  test('never lets a closed manifest be recorded as cancelled', () => {
    const check = checkSqlByName(mdfeFiscalDocuments).mdfe_fiscal_documents_closed_never_cancels

    expect(check).toContain('closed_at')
    expect(check).toContain("'cancelled'")
  })

  test('keeps one fiscal document per manifest and one key per tenant', () => {
    expect(uniqueColumnsByName(mdfeFiscalDocuments)).toMatchObject({
      mdfe_fiscal_documents_company_access_key_unique: ['company_id', 'access_key'],
      mdfe_fiscal_documents_company_id_id_unique: ['company_id', 'id'],
      mdfe_fiscal_documents_company_manifest_unique: ['company_id', 'manifest_id'],
    })
  })
})

describe('mdfe issuance event schema', () => {
  test('names only the events the manifest rail emits', () => {
    expect(getTableConfig(mdfeIssuanceEvents).name).toBe('mdfe_issuance_events')

    expect(columnNames(mdfeIssuanceEvents)).toEqual([
      'id',
      'company_id',
      'attempt_id',
      'manifest_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expect(columnSqlTypes(mdfeIssuanceEvents)).toMatchObject({ payload: 'jsonb' })

    const check = checkSqlByName(mdfeIssuanceEvents).mdfe_issuance_events_name_check
    expect(check).toContain("'issue_requested'")
    expect(check).toContain("'close_requested'")
    expect(check).toContain("'cancel_requested'")
    expect(check).toContain("'closed'")
  })
})

describe('mdfe issuance outbox schema', () => {
  test('publishes the manifest rail with a claim and a stable event identity', () => {
    expect(getTableConfig(mdfeIssuanceOutbox).name).toBe('mdfe_issuance_outbox')

    expect(columnNames(mdfeIssuanceOutbox)).toEqual([
      'id',
      'event_id',
      'company_id',
      'aggregate_type',
      'aggregate_subtype',
      'aggregate_id',
      'manifest_id',
      'attempt_id',
      'attempt_kind',
      'status',
      'event_type',
      'event_version',
      'attempt_fingerprint',
      'actor_user_id',
      'correlation_id',
      'payload',
      'claim_owner',
      'claim_expires_at',
      'next_attempt_at',
      'published_at',
      'created_at',
      'updated_at',
    ])

    expect(uniqueColumnsByName(mdfeIssuanceOutbox)).toMatchObject({
      mdfe_issuance_outbox_company_id_event_id_unique: ['company_id', 'event_id'],
      mdfe_issuance_outbox_company_id_id_unique: ['company_id', 'id'],
    })
    expect(indexColumnsByName(mdfeIssuanceOutbox)).toMatchObject({
      mdfe_issuance_outbox_company_published_next_attempt_created_idx: [
        'company_id',
        'published_at',
        'next_attempt_at',
        'created_at',
      ],
    })
  })

  test('binds the event type to the manifest rail and pairs the relay claim', () => {
    const checks = checkSqlByName(mdfeIssuanceOutbox)

    expect(checks.mdfe_issuance_outbox_event_type_check).toContain(
      "'transportada.mdfe.manifest.issue.requested'",
    )
    expect(checks.mdfe_issuance_outbox_event_type_check).toContain(
      "'transportada.mdfe.manifest.close.requested'",
    )
    expect(checks.mdfe_issuance_outbox_event_type_check).toContain(
      "'transportada.mdfe.manifest.cancel.requested'",
    )
    expect(checks.mdfe_issuance_outbox_status_check).toContain(
      "in ('requested', 'retry_scheduled')",
    )
    expect(checks.mdfe_issuance_outbox_claim_check).toContain('is null')
  })
})

describe('mdfe issuance payload schema', () => {
  // O worker não remonta o MdfeData: o que a SEFAZ recebe é o congelado no pedido
  test('freezes the provider config and the manifest payload of the issuing attempt', () => {
    expect(getTableConfig(mdfeIssuancePayloads).name).toBe('mdfe_issuance_payloads')
    expectGeneratedUuidPrimaryKey(mdfeIssuancePayloads)

    expect(columnNames(mdfeIssuancePayloads)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'attempt_id',
      'payload',
      'provider_config',
      'payload_sha256',
      'created_at',
    ])
    expect(columnSqlTypes(mdfeIssuancePayloads)).toMatchObject({
      payload: 'jsonb',
      provider_config: 'jsonb',
    })
    expect(checkSqlByName(mdfeIssuancePayloads).mdfe_issuance_payloads_sha256_check).toContain(
      "~ '^[0-9a-f]{64}$'",
    )
  })

  test('keeps exactly one frozen payload per attempt inside the tenant', () => {
    expect(uniqueColumnsByName(mdfeIssuancePayloads)).toMatchObject({
      mdfe_issuance_payloads_company_attempt_unique: ['company_id', 'attempt_id'],
      mdfe_issuance_payloads_company_id_id_unique: ['company_id', 'id'],
    })
    expect(indexColumnsByName(mdfeIssuancePayloads)).toMatchObject({
      mdfe_issuance_payloads_company_manifest_created_at_idx: [
        'company_id',
        'manifest_id',
        'created_at',
      ],
    })
  })
})

describe('mdfe processed message schema', () => {
  test('keeps the manifest rail idempotency ledger free of an outbox foreign key', () => {
    expect(getTableConfig(mdfeProcessedMessages).name).toBe('mdfe_processed_messages')
    expectGeneratedUuidPrimaryKey(mdfeProcessedMessages)

    expect(columnNames(mdfeProcessedMessages)).toEqual([
      'id',
      'company_id',
      'consumer_name',
      'event_id',
      'manifest_id',
      'attempt_id',
      'result',
      'created_at',
    ])
    expect(
      getTableConfig(mdfeProcessedMessages).foreignKeys.map((key) => key.getName() ?? ''),
    ).toEqual(['mdfe_processed_messages_company_id_companies_id_fk'])
  })

  test('lets the same consumer record an event exactly once per company', () => {
    expect(uniqueColumnsByName(mdfeProcessedMessages)).toMatchObject({
      mdfe_processed_messages_company_consumer_event_unique: [
        'company_id',
        'consumer_name',
        'event_id',
      ],
      mdfe_processed_messages_company_id_id_unique: ['company_id', 'id'],
    })
  })
})
