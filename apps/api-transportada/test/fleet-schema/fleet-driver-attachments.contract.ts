/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  indexColumnsByName,
  uniqueIndexWhereSqlByName,
} from '../fiscal-schema/support.js'

describe('fleet driver attachments schema', () => {
  test('guarda a referência do arquivo, nunca o conteúdo', () => {
    expect(getTableConfig(fleetDriverAttachments).name).toBe('fleet_driver_attachments')
    expect(columnNames(fleetDriverAttachments)).toEqual([
      'id',
      'company_id',
      'driver_id',
      'type',
      'stored_object_id',
      'extracted_fields',
      'extracted_at',
      'decision',
      'decided_by',
      'decided_at',
      'uploaded_by',
      'created_at',
    ])
  })

  test('tem um documento vivo por tipo e motorista, e só o outro aceita vários', () => {
    const name = 'fleet_driver_attachments_company_driver_type_unique'

    expect(indexColumnsByName(fleetDriverAttachments)[name]).toEqual([
      'company_id',
      'driver_id',
      'type',
    ])
    expect(uniqueIndexWhereSqlByName(fleetDriverAttachments)[name]).toContain("<> 'other'")
  })

  test('tipo é lista fechada, e a leitura sugerida some junto da decisão', () => {
    const checks = checkSqlByName(fleetDriverAttachments)

    expect(checks['fleet_driver_attachments_type_check']).toContain(
      "in ('cnh', 'address_proof', 'identity_document', 'other')",
    )
    expect(checks['fleet_driver_attachments_decided_without_fields_check']).toContain('is null or')
  })

  test('não existe coluna de expiração nem de conteúdo do arquivo', () => {
    const names = columnNames(fleetDriverAttachments)

    expect(names).not.toContain('expires_at')
    expect(names).not.toContain('content')
    expect(names).not.toContain('bytes')
  })

  /** A linha do outbox não pode apontar para o anexo de outra empresa: a FK é composta. */
  test('o pedido de leitura aponta para o anexo pela empresa e leva referência, nunca o arquivo', () => {
    expect(getTableConfig(fleetDriverAttachmentOutbox).name).toBe('fleet_driver_attachment_outbox')
    expect(foreignKeys(fleetDriverAttachmentOutbox)).toContainEqual({
      columns: ['company_id', 'attachment_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_driver_attachments',
      name: 'fleet_driver_attachment_outbox_company_attachment_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(columnNames(fleetDriverAttachmentOutbox)).not.toContain('actor_user_id')
    expect(
      checkSqlByName(fleetDriverAttachmentOutbox)[
        'fleet_driver_attachment_outbox_event_type_check'
      ],
    ).toContain("'attachment.extraction.requested'")
  })
})
