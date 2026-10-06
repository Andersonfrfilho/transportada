/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.2 (ADR-0094 §6): a chegada, as notas dela e a trilha append-only. Tudo preso ao
 * tenant por FK composta, sem ENUM nativo, e com o eixo e o relógio garantidos pelo banco.
 */
import { describe, expect, test } from 'bun:test'

import {
  cargoArrivalDocuments,
  cargoArrivalEvents,
  cargoArrivals,
  nfeParticipants,
} from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const RESTRICT = { onDelete: 'restrict', onUpdate: 'cascade' } as const
const MEMBERSHIP = {
  foreignColumns: ['user_id', 'company_id'],
  foreignTable: 'user_company_memberships',
  ...RESTRICT,
} as const

describe('a chegada da carga (spec 237 T2.2)', () => {
  test('alcança contratante e quem registrou pela empresa', () => {
    expect(foreignKeys(cargoArrivals)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'contractor_id'],
          foreignColumns: ['company_id', 'id'],
          foreignTable: 'contractors',
          name: 'cargo_arrivals_company_contractor_fk',
          ...RESTRICT,
        },
        {
          columns: ['registered_by_user_id', 'company_id'],
          name: 'cargo_arrivals_registered_by_membership_fk',
          ...MEMBERSHIP,
        },
      ]),
    )
  })

  test('a chave de idempotência é única por empresa', () => {
    expect(uniqueColumnsByName(cargoArrivals)).toEqual({
      cargo_arrivals_company_id_id_unique: ['company_id', 'id'],
      cargo_arrivals_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expectGeneratedUuidPrimaryKey(cargoArrivals)
  })

  test('janela, prazo, paletes e referência são opcionais; o resto é obrigatório', () => {
    expect([...requiredColumnNames(cargoArrivals)].sort()).toEqual(
      [
        'arrived_at',
        'channel',
        'company_id',
        'contractor_id',
        'created_at',
        'id',
        'idempotency_key',
        'registered_by_user_id',
        'request_fingerprint',
        'status',
        'updated_at',
      ].sort(),
    )
    expect(columnSqlTypes(cargoArrivals)).toMatchObject({
      channel: 'varchar(16)',
      delivery_deadline_business_days: 'smallint',
      pallet_count: 'integer',
      separation_window_hours: 'smallint',
      status: 'varchar(16)',
    })
  })

  test('o prazo da separação é exatamente a janela copiada, e as faixas são as do perfil', () => {
    expect(unqualifiedCheckSqlByName(cargoArrivals)).toEqual({
      cargo_arrivals_channel_check: `"channel" in ('backoffice')`,
      cargo_arrivals_delivery_deadline_business_days_check:
        '"delivery_deadline_business_days" between 1 and 60',
      cargo_arrivals_idempotency_key_check: 'char_length("idempotency_key") between 16 and 256',
      cargo_arrivals_pallet_count_check: '"pallet_count" >= 0',
      cargo_arrivals_reference_check: 'char_length("reference") between 1 and 120',
      cargo_arrivals_request_fingerprint_check: `"request_fingerprint" ~ '^[0-9a-f]{64}$'`,
      cargo_arrivals_separation_due_at_check:
        '("separation_window_hours" is null) = ("separation_due_at" is null) and ("separation_due_at" is null or extract(epoch from "separation_due_at" - "arrived_at") = "separation_window_hours" * 3600)',
      cargo_arrivals_separation_window_hours_check: '"separation_window_hours" between 1 and 168',
      cargo_arrivals_status_check: `"status" in ('open', 'closed')`,
    })
  })

  test('lista por contratante e por data sem varrer a tabela', () => {
    expect(indexColumnsByName(cargoArrivals)).toEqual({
      cargo_arrivals_company_arrived_idx: ['company_id', 'arrived_at', 'id'],
      cargo_arrivals_company_contractor_arrived_idx: [
        'company_id',
        'contractor_id',
        'arrived_at',
        'id',
      ],
    })
  })
})

describe('a nota na chegada (spec 237 T2.2)', () => {
  test('pertence à chegada e à nota fiscal da mesma empresa', () => {
    expect(foreignKeys(cargoArrivalDocuments)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'arrival_id'],
          foreignColumns: ['company_id', 'id'],
          foreignTable: 'cargo_arrivals',
          name: 'cargo_arrival_documents_company_arrival_fk',
          ...RESTRICT,
        },
        {
          columns: ['company_id', 'nfe_document_id'],
          foreignColumns: ['company_id', 'id'],
          foreignTable: 'nfe_documents',
          name: 'cargo_arrival_documents_company_document_fk',
          ...RESTRICT,
        },
      ]),
    )
  })

  /** ADR-0094 §6: uma nota entra em no máximo uma chegada, para sempre. */
  test('uma nota, uma chegada', () => {
    expect(uniqueColumnsByName(cargoArrivalDocuments)).toEqual({
      cargo_arrival_documents_company_arrival_id_unique: ['company_id', 'arrival_id', 'id'],
      cargo_arrival_documents_company_id_id_unique: ['company_id', 'id'],
      cargo_arrival_documents_company_document_unique: ['company_id', 'nfe_document_id'],
    })
    expectGeneratedUuidPrimaryKey(cargoArrivalDocuments)
  })

  test('o estado e as datas andam juntos, e rota e cidade têm forma', () => {
    expect(unqualifiedCheckSqlByName(cargoArrivalDocuments)).toEqual({
      cargo_arrival_documents_city_ibge_code_check: `"city_ibge_code" ~ '^[0-9]{7}$'`,
      cargo_arrival_documents_return_occurrence_check: `("return_to_contractor" = 'none') = ("return_occurrence_id" is null)`,
      cargo_arrival_documents_return_to_contractor_check: `"return_to_contractor" in ('marked', 'none', 'returned')`,
      cargo_arrival_documents_route_name_check: 'char_length("route_name") between 1 and 40',
      cargo_arrival_documents_separation_state_check: `"separation_state" in ('expected', 'received', 'separated')`,
      cargo_arrival_documents_state_dates_check: `("separation_state" = 'expected' and "received_at" is null and "separated_at" is null) or ("separation_state" = 'received' and "received_at" is not null and "separated_at" is null) or ("separation_state" = 'separated' and "received_at" is not null and "separated_at" is not null and "separated_at" >= "received_at")`,
    })
    expect([...requiredColumnNames(cargoArrivalDocuments)].sort()).toEqual(
      [
        'arrival_id',
        'company_id',
        'created_at',
        'id',
        'nfe_document_id',
        'return_to_contractor',
        'separation_state',
        'updated_at',
      ].sort(),
    )
  })
})

describe('a trilha da chegada (spec 237 T2.2, ADR-0067)', () => {
  test('o evento de nota aponta para uma nota DESTA chegada, e o ator é membro da empresa', () => {
    expect(foreignKeys(cargoArrivalEvents)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'arrival_id', 'arrival_document_id'],
          foreignColumns: ['company_id', 'arrival_id', 'id'],
          foreignTable: 'cargo_arrival_documents',
          name: 'cargo_arrival_events_arrival_document_fk',
          ...RESTRICT,
        },
        {
          columns: ['actor_user_id', 'company_id'],
          name: 'cargo_arrival_events_actor_membership_fk',
          ...MEMBERSHIP,
        },
      ]),
    )
  })

  test('o tipo decide a nota e a transição gravada', () => {
    const checks = unqualifiedCheckSqlByName(cargoArrivalEvents)
    expect(checks.cargo_arrival_events_kind_check).toBe(
      `"kind" in ('arrival_closed', 'arrival_registered', 'document_added', 'document_received', 'document_separated', 'occurrence_registered', 'return_completed', 'return_marked', 'return_unmarked', 'route_assigned')`,
    )
    expect(checks.cargo_arrival_events_document_scope_check).toBe(
      `("kind" in ('arrival_registered', 'arrival_closed')) = ("arrival_document_id" is null)`,
    )
    expect(checks.cargo_arrival_events_state_shape_check).toBe(
      `case "kind" when 'document_added' then "from_state" is null and "to_state" is not null and "to_state" = 'expected' when 'document_received' then "from_state" is not null and "to_state" is not null and "from_state" = 'expected' and "to_state" = 'received' when 'document_separated' then "from_state" is not null and "to_state" is not null and "from_state" = 'received' and "to_state" = 'separated' else "from_state" is null and "to_state" is null end`,
    )
    expect(checks.cargo_arrival_events_channel_check).toBe(`"channel" in ('backoffice')`)
    expect(checks.cargo_arrival_events_details_check).toBe(`jsonb_typeof("details") = 'object'`)
    expect([...requiredColumnNames(cargoArrivalEvents)].sort()).toEqual(
      [
        'actor_user_id',
        'arrival_id',
        'channel',
        'company_id',
        'id',
        'kind',
        'occurred_at',
        'recorded_at',
      ].sort(),
    )
  })
})

describe('as notas disponíveis de um emitente (spec 237 T2.2)', () => {
  test('o emitente é achado pelo CNPJ sem varrer os participantes da empresa', () => {
    expect(indexColumnsByName(nfeParticipants)).toMatchObject({
      nfe_participants_company_role_tax_id_idx: ['company_id', 'role', 'tax_id'],
    })
  })
})
