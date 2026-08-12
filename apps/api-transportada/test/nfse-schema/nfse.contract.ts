/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
  uniqueIndexWhereSqlByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('nfse emission profile schema', () => {
  test('carries the municipal fiscal identity and the charge rule of the service note', () => {
    const profiles = requireSchemaTable('nfseEmissionProfiles')

    expectGeneratedUuidPrimaryKey(profiles)
    expect(columnNames(profiles)).toContainAllValues([
      'id',
      'company_id',
      'name',
      'status',
      'freight_rule_id',
      'taker',
      'charge_component_label',
      'municipality_ibge_code',
      'municipality_name',
      'cnae_code',
      'service_list_item',
      'municipal_taxation_code',
      'nbs_code',
      'iss_rate',
      'iss_withheld',
      'iss_exigibility',
      'description_template',
      'description_max_length',
      'observations',
      'version',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(profiles)).toMatchObject({
      iss_rate: 'numeric(9, 6)',
      iss_withheld: 'boolean',
    })
    expect(uniqueColumnsByName(profiles)).toMatchObject({
      nfse_emission_profiles_company_id_id_unique: ['company_id', 'id'],
      nfse_emission_profiles_company_id_name_unique: ['company_id', 'name'],
    })
  })

  test('accepts only the takers the fiscal vocabulary defines and a rate within the unit interval', () => {
    const checks = checkSqlByName(requireSchemaTable('nfseEmissionProfiles'))

    expect(checks['nfse_emission_profiles_taker_check']).toBe(
      `"nfse_emission_profiles"."taker" in ('0', '3')`,
    )
    expect(checks['nfse_emission_profiles_iss_rate_check']).toContain('<= 1')
    expect(checks['nfse_emission_profiles_municipality_check']).toContain('[0-9]{7}')
    expect(checks['nfse_emission_profiles_description_max_length_check']).toContain('between')
  })
})

describe('nfse provider credential schema', () => {
  test('stores the provider secret sealed and never as a readable column', () => {
    const credentials = requireSchemaTable('nfseProviderCredentials')

    expect(columnNames(credentials)).toContainAllValues([
      'id',
      'company_id',
      'provider',
      'fiscal_environment',
      'tax_id',
      'municipal_registration',
      'secret_envelope',
      'callback_token_sha256',
      'status',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(credentials)).toMatchObject({ secret_envelope: 'jsonb' })
    expect(requiredColumnNames(credentials)).toContainValues([
      'secret_envelope',
      'callback_token_sha256',
    ])
  })

  /** A rota de callback é anônima: ela resolve a empresa pelo token, então ele é único global. */
  test('keeps the callback token globally unique so the anonymous route can resolve it', () => {
    expect(uniqueColumnsByName(requireSchemaTable('nfseProviderCredentials'))).toMatchObject({
      nfse_provider_credentials_callback_token_sha256_unique: ['callback_token_sha256'],
      nfse_provider_credentials_company_provider_environment_unique: [
        'company_id',
        'provider',
        'fiscal_environment',
      ],
    })
    expect(checkSqlByName(requireSchemaTable('nfseProviderCredentials'))).toMatchObject({
      nfse_provider_credentials_callback_token_check: `"nfse_provider_credentials"."callback_token_sha256" ~ '^[0-9a-f]{64}$'`,
    })
  })
})

describe('nfse service invoice schema', () => {
  test('records the taker, the composed amount and the description that was sent', () => {
    const invoices = requireSchemaTable('nfseServiceInvoices')

    expect(columnNames(invoices)).toContainAllValues([
      'id',
      'company_id',
      'emission_profile_id',
      'taker_tax_id',
      'taker_legal_name',
      'status',
      'service_amount',
      'iss_amount',
      'description',
      'calculation_snapshot',
      'provider_document_id',
      'provider_number',
      'verification_code',
      'rejection_code',
      'rejection_message',
      'next_status_check_at',
      'authorized_at',
      'cancelled_at',
      'cancellation_reason',
      'version',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(invoices)).toMatchObject({
      service_amount: 'numeric(19, 4)',
      iss_amount: 'numeric(19, 4)',
      calculation_snapshot: 'jsonb',
    })
  })

  test('only reaches a settled status with the evidence that settles it', () => {
    const checks = checkSqlByName(requireSchemaTable('nfseServiceInvoices'))

    expect(checks['nfse_service_invoices_authorized_check']).toContain('provider_document_id')
    expect(checks['nfse_service_invoices_rejected_check']).toContain('rejection_code')
    expect(checks['nfse_service_invoices_cancelled_check']).toContain('cancelled_at')
    expect(checks['nfse_service_invoices_amount_check']).toContain('>= 0')
  })

  /**
   * O pedido de cancelamento já nasce com motivo, mas ainda não com data: quem carimba o instante
   * em que o documento deixou de valer é a prefeitura.
   */
  test('requires a reason for a cancellation in flight and refuses to date it early', () => {
    const check = checkSqlByName(requireSchemaTable('nfseServiceInvoices'))[
      'nfse_service_invoices_cancellation_requested_check'
    ]

    expect(check).toContain('cancellation_reason')
    expect(check).toContain('cancelled_at')
    expect(check).toContain('is null')
  })

  /** Os dois estados assíncronos varrem; nenhum outro pode ficar agendado para reconciliação. */
  test('schedules reconciliation for both states that wait on the city', () => {
    const check = checkSqlByName(requireSchemaTable('nfseServiceInvoices'))[
      'nfse_service_invoices_next_check_state_check'
    ]

    expect(check).toContain('pending_authorization')
    expect(check).toContain('cancellation_requested')
  })

  test('indexes the reconciliation sweep by company, status and due check', () => {
    expect(indexColumnsByName(requireSchemaTable('nfseServiceInvoices'))).toMatchObject({
      nfse_service_invoices_company_status_next_check_idx: [
        'company_id',
        'status',
        'next_status_check_at',
      ],
    })
  })
})

describe('nfse service invoice link schema', () => {
  /** Mesma forma de `billing_invoice_items_active_cte_document_unique`: cancelar devolve a nota. */
  test('binds one nfe to a single active service note and frees it on cancellation', () => {
    const links = requireSchemaTable('nfseServiceInvoiceDocuments')

    expect(columnNames(links)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'nfe_document_id',
      'position',
      'cancelled_at',
      'created_at',
      'updated_at',
    ])
    expect(uniqueIndexWhereSqlByName(links)).toMatchObject({
      nfse_service_invoice_documents_active_nfe_unique:
        '"nfse_service_invoice_documents"."cancelled_at" is null',
    })
    expect(uniqueColumnsByName(links)).toMatchObject({
      nfse_service_invoice_documents_company_invoice_position_unique: [
        'company_id',
        'invoice_id',
        'position',
      ],
    })
  })
})

describe('nfse service invoice charge schema', () => {
  test('mirrors the cte charge breakdown, rate or amount but never both', () => {
    const charges = requireSchemaTable('nfseServiceInvoiceCharges')

    expect(columnNames(charges)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'ordinal',
      'label',
      'calculation_type',
      'rate',
      'base_amount',
      'amount',
      'created_at',
    ])
    expect(columnSqlTypes(charges)).toMatchObject({
      rate: 'numeric(9, 6)',
      base_amount: 'numeric(19, 4)',
      amount: 'numeric(19, 4)',
    })
    expect(checkSqlByName(charges)['nfse_service_invoice_charges_value_coherence_check']).toContain(
      'fixed_amount',
    )
  })
})

describe('nfse issuance rail schema', () => {
  test('keeps one attempt per idempotency key and freezes the payload it sent', () => {
    const attempts = requireSchemaTable('nfseIssuanceAttempts')
    const payloads = requireSchemaTable('nfseIssuancePayloads')

    expect(columnNames(attempts)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'attempt_kind',
      'attempt_number',
      'status',
      'idempotency_key',
      'idempotency_fingerprint',
      'request_fingerprint',
      'fiscal_environment',
      'last_error_code',
      'last_error_cause',
      'last_error_message',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(attempts)).toMatchObject({
      nfse_issuance_attempts_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(uniqueColumnsByName(payloads)).toMatchObject({
      nfse_issuance_payloads_company_attempt_unique: ['company_id', 'attempt_id'],
    })
    expect(checkSqlByName(payloads)['nfse_issuance_payloads_sha256_check']).toContain(
      '[0-9a-f]{64}',
    )
  })

  test('gives the relay the claim pairing and the due index it sweeps', () => {
    const outbox = requireSchemaTable('nfseIssuanceOutbox')

    expect(checkSqlByName(outbox)['nfse_issuance_outbox_claim_check']).toBe(
      '("nfse_issuance_outbox"."claim_owner" is null) = ("nfse_issuance_outbox"."claim_expires_at" is null)',
    )
    expect(indexColumnsByName(outbox)).toMatchObject({
      nfse_issuance_outbox_company_published_next_attempt_created_idx: [
        'company_id',
        'published_at',
        'next_attempt_at',
        'created_at',
      ],
    })
    expect(uniqueColumnsByName(outbox)).toMatchObject({
      nfse_issuance_outbox_company_id_event_id_unique: ['company_id', 'event_id'],
    })
  })

  test('appends issuance events with the payload that produced them', () => {
    const events = requireSchemaTable('nfseIssuanceEvents')

    expect(columnNames(events)).toContainAllValues([
      'id',
      'company_id',
      'attempt_id',
      'invoice_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expect(indexColumnsByName(events)).toMatchObject({
      nfse_issuance_events_company_invoice_created_at_idx: [
        'company_id',
        'invoice_id',
        'created_at',
      ],
    })
  })

  test('ledgers one processed message per consumer and event', () => {
    expect(uniqueColumnsByName(requireSchemaTable('nfseProcessedMessages'))).toMatchObject({
      nfse_processed_messages_company_consumer_event_unique: [
        'company_id',
        'consumer_name',
        'event_id',
      ],
    })
  })

  test('archives the authorized xml and pdf as stored objects, paired with their digests', () => {
    const documents = requireSchemaTable('nfseFiscalDocuments')

    expect(columnNames(documents)).toContainAllValues([
      'id',
      'company_id',
      'invoice_id',
      'attempt_id',
      'provider_document_id',
      'fiscal_number',
      'verification_code',
      'fiscal_environment',
      'status',
      'xml_object_id',
      'xml_sha256',
      'pdf_object_id',
      'pdf_sha256',
      'authorized_at',
      'cancelled_at',
      'created_at',
      'updated_at',
    ])
    expect(checkSqlByName(documents)['nfse_fiscal_documents_pdf_check']).toContain(
      '"nfse_fiscal_documents"."pdf_object_id" is null',
    )
    expect(uniqueColumnsByName(documents)).toMatchObject({
      nfse_fiscal_documents_company_invoice_unique: ['company_id', 'invoice_id'],
    })
  })
})

describe('stored object purposes', () => {
  test('accepts the nfse document purpose', async () => {
    const { STORAGE_OBJECT_PURPOSES, storedObjects } = await import(
      '../../src/database/storage.schema.js'
    )

    const purposes: readonly string[] = STORAGE_OBJECT_PURPOSES

    expect(purposes).toContain('nfse_document')
    expect(checkSqlByName(storedObjects)['stored_objects_purpose_check']).toContain('nfse_document')
  })
})
