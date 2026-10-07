/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0094 §3/§4/§7): a prévia, os itens, o vínculo 1:1 com a nota, o par roteiro ↔
 * carga, o alias aprendido, a trilha e o pedido ao worker. Tudo preso ao tenant por FK composta e
 * sem ENUM nativo.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_PREVIEW_ERROR_CODES } from '../../src/cargo-receiving/domain/cargo-preview-workbook.constant.js'
import {
  cargoPreviewDocumentLinks,
  cargoPreviewEvents,
  cargoPreviewItems,
  cargoPreviewOutbox,
  cargoPreviewRouteLoads,
  cargoPreviews,
  contractorRecipientAliases,
} from '../../src/database/database.schema.js'
import { CARGO_PREVIEW_FAILURE_CODES } from '../../src/shared/cargo-preview.constant.js'
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

function companyFk(input: { columns: string[]; foreignTable: string; name: string }) {
  return {
    columns: input.columns,
    foreignColumns: [
      'company_id',
      ...input.columns.slice(1).map((column) => column.replace(/^.*_id$/u, 'id')),
    ],
    foreignTable: input.foreignTable,
    name: input.name,
    ...RESTRICT,
  }
}

describe('a prévia (spec 237 T4.2)', () => {
  test('alcança contratante, quem enviou e a chegada pela empresa', () => {
    expect(foreignKeys(cargoPreviews)).toEqual(
      expect.arrayContaining([
        companyFk({
          columns: ['company_id', 'contractor_id'],
          foreignTable: 'contractors',
          name: 'cargo_previews_company_contractor_fk',
        }),
        companyFk({
          columns: ['company_id', 'arrival_id'],
          foreignTable: 'cargo_arrivals',
          name: 'cargo_previews_company_arrival_fk',
        }),
        {
          columns: ['uploaded_by_user_id', 'company_id'],
          foreignColumns: ['user_id', 'company_id'],
          foreignTable: 'user_company_memberships',
          name: 'cargo_previews_uploaded_by_membership_fk',
          ...RESTRICT,
        },
      ]),
    )
    expectGeneratedUuidPrimaryKey(cargoPreviews)
  })

  test('o mesmo arquivo do mesmo contratante não duplica, e a chave é única por empresa', () => {
    expect(uniqueColumnsByName(cargoPreviews)).toEqual({
      cargo_previews_company_contractor_file_unique: ['company_id', 'contractor_id', 'file_sha256'],
      cargo_previews_company_id_id_unique: ['company_id', 'id'],
      cargo_previews_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(indexColumnsByName(cargoPreviews)).toMatchObject({
      cargo_previews_company_arrival_unique: ['company_id', 'arrival_id'],
      cargo_previews_company_received_idx: ['company_id', 'received_at', 'id'],
    })
  })

  test('situação, origem e falha são listas fechadas, e falhar exige o código', () => {
    const checks = unqualifiedCheckSqlByName(cargoPreviews)
    expect(checks.cargo_previews_status_check).toBe(
      `"status" in ('failed', 'processing', 'queued', 'ready')`,
    )
    expect(checks.cargo_previews_source_check).toBe(`"source" in ('email', 'upload')`)
    expect(checks.cargo_previews_uploader_check).toBe(
      `("source" = 'upload') = ("uploaded_by_user_id" is not null)`,
    )
    expect(checks.cargo_previews_failure_shape_check).toBe(
      `("status" = 'failed') = ("error_code" is not null)`,
    )
    expect(checks.cargo_previews_file_name_check).toBe(
      `char_length("file_name") between 1 and 180 and strpos("file_name", '/') = 0 and strpos("file_name", chr(92)) = 0`,
    )
    expect(columnSqlTypes(cargoPreviews)).toMatchObject({
      file_sha256: 'char(64)',
      planned_date: 'date',
      received_at: 'timestamp with time zone',
      status: 'varchar(16)',
    })
  })

  test('todo código do leitor cabe no CHECK da prévia que falhou', () => {
    expect(CARGO_PREVIEW_FAILURE_CODES).toEqual(
      expect.arrayContaining([...CARGO_PREVIEW_ERROR_CODES]),
    )
  })

  test('o recebimento é obrigatório; só a prévia por e-mail dispensa quem enviou (T4.6)', () => {
    expect([...requiredColumnNames(cargoPreviews)].sort()).toEqual(
      [
        'company_id',
        'contractor_id',
        'created_at',
        'file_name',
        'file_object_id',
        'file_sha256',
        'file_size_bytes',
        'id',
        'idempotency_key',
        'received_at',
        'request_fingerprint',
        'source',
        'status',
        'updated_at',
      ].sort(),
    )
  })
})

describe('o item e o vínculo 1:1 com a nota (spec 237 RF5a)', () => {
  test('o item vinculado aponta para o vínculo da nota NESTA prévia', () => {
    expect(foreignKeys(cargoPreviewItems)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'preview_id', 'matched_document_id'],
          foreignColumns: ['company_id', 'preview_id', 'document_id'],
          foreignTable: 'cargo_preview_document_links',
          name: 'cargo_preview_items_document_link_fk',
          ...RESTRICT,
        },
      ]),
    )
    expect(uniqueColumnsByName(cargoPreviewItems)).toMatchObject({
      cargo_preview_items_company_preview_row_unique: ['company_id', 'preview_id', 'row_number'],
    })
    expect(indexColumnsByName(cargoPreviewItems)).toMatchObject({
      cargo_preview_items_company_document_idx: ['company_id', 'matched_document_id'],
    })
  })

  /** N linhas ↔ 1 nota é permitido; a mesma nota em duas prévias, nunca. */
  test('uma nota, uma prévia: o unique mora no vínculo, não no item', () => {
    expect(uniqueColumnsByName(cargoPreviewDocumentLinks)).toEqual({
      cargo_preview_document_links_company_document_unique: ['company_id', 'document_id'],
      cargo_preview_document_links_company_preview_document_unique: [
        'company_id',
        'preview_id',
        'document_id',
      ],
    })
    expect(foreignKeys(cargoPreviewDocumentLinks)).toEqual(
      expect.arrayContaining([
        companyFk({
          columns: ['company_id', 'document_id'],
          foreignTable: 'nfe_documents',
          name: 'cargo_preview_document_links_company_document_fk',
        }),
      ]),
    )
  })

  test('o estado decide a nota, o erro e o mínimo do vínculo', () => {
    const checks = unqualifiedCheckSqlByName(cargoPreviewItems)
    expect(checks.cargo_preview_items_match_state_check).toBe(
      `"match_state" in ('ambiguous', 'awaiting_xml', 'invalid', 'matched', 'suggested')`,
    )
    expect(checks.cargo_preview_items_matched_shape_check).toBe(
      `("match_state" = 'matched') = ("matched_document_id" is not null)`,
    )
    expect(checks.cargo_preview_items_invalid_shape_check).toBe(
      `("match_state" = 'invalid') = ("row_error" is not null)`,
    )
    expect(columnSqlTypes(cargoPreviewItems)).toMatchObject({
      value: 'numeric(14, 2)',
      volume_m3: 'numeric(12, 4)',
      weight_kg: 'numeric(12, 3)',
    })
  })

  test('o par roteiro ↔ carga é 1:1 dentro da prévia', () => {
    expect(uniqueColumnsByName(cargoPreviewRouteLoads)).toEqual({
      cargo_preview_route_loads_preview_load_unique: ['company_id', 'preview_id', 'load_reference'],
      cargo_preview_route_loads_preview_route_unique: ['company_id', 'preview_id', 'route_name'],
    })
  })

  test('o alias é um por código do contratante', () => {
    expect(uniqueColumnsByName(contractorRecipientAliases)).toEqual({
      contractor_recipient_aliases_contractor_code_unique: [
        'company_id',
        'contractor_id',
        'recipient_code',
      ],
    })
  })
})

describe('a trilha e o pedido ao worker (spec 237 T4.2/T4.3)', () => {
  test('o evento automático não tem ator; o do painel tem', () => {
    const checks = unqualifiedCheckSqlByName(cargoPreviewEvents)
    expect(checks.cargo_preview_events_actor_check).toBe(
      `("channel" = 'worker') = ("actor_user_id" is null)`,
    )
    expect(checks.cargo_preview_events_channel_check).toBe(`"channel" in ('backoffice', 'worker')`)
    expect(foreignKeys(cargoPreviewEvents)).toEqual(
      expect.arrayContaining([
        {
          columns: ['company_id', 'preview_id', 'item_id'],
          foreignColumns: ['company_id', 'preview_id', 'id'],
          foreignTable: 'cargo_preview_items',
          name: 'cargo_preview_events_item_fk',
          ...RESTRICT,
        },
      ]),
    )
  })

  test('o pedido de leitura leva a prévia; o de reavaliação, só o contratante', () => {
    const checks = unqualifiedCheckSqlByName(cargoPreviewOutbox)
    expect(checks.cargo_preview_outbox_event_type_check).toBe(
      `"event_type" in ('cargo-preview.process', 'cargo-preview.reevaluate')`,
    )
    expect(checks.cargo_preview_outbox_preview_scope_check).toBe(
      `("event_type" = 'cargo-preview.process') = ("preview_id" is not null)`,
    )
    expect(indexColumnsByName(cargoPreviewOutbox)).toMatchObject({
      cargo_preview_outbox_pending_contractor_idx: ['company_id', 'contractor_id', 'event_type'],
    })
  })
})
