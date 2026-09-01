/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { aggregateApplicationAttachments } from '../../src/database/database.schema.js'
import { checkSqlByName, columnNames, foreignKeys } from '../fiscal-schema/support.js'

describe('aggregate application attachments schema', () => {
  test('guarda o rascunho de anexo com identidade pública própria', () => {
    expect(getTableConfig(aggregateApplicationAttachments).name).toBe(
      'aggregate_application_attachments',
    )

    expect(columnNames(aggregateApplicationAttachments)).toEqual([
      'id',
      'company_id',
      'draft_id',
      'application_id',
      'type',
      'stored_object_id',
      'extracted_fields',
      'status',
      'rejection_reason',
      'reviewed_by',
      'reviewed_at',
      'created_at',
      'updated_at',
    ])
  })

  /**
   * O rascunho nasce **sem** candidatura: quem anexa está preenchendo o formulário e ainda não
   * enviou. `application_id` só é preenchido no submit, e por isso é o único vínculo nulável.
   */
  test('a candidatura é opcional, e o resto é obrigatório', () => {
    const optional = getTableConfig(aggregateApplicationAttachments)
      .columns.filter((column) => !column.notNull)
      .map((column) => column.name)

    expect(optional).toEqual(['application_id', 'extracted_fields', 'reviewed_by', 'reviewed_at'])
  })

  /** O arquivo é amarrado por chave **composta** com a empresa: objeto de outro tenant não entra. */
  test('o arquivo e a empresa são amarrados por chave composta, como no documento do agregado', () => {
    const keys = foreignKeys(aggregateApplicationAttachments)

    expect(keys).toContainEqual({
      columns: ['company_id', 'stored_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'aggregate_application_attachments_company_stored_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(keys.map((key) => key.name)).toContain(
      'aggregate_application_attachments_application_id_fk',
    )
  })

  /** O identificador que vai para o cliente anônimo é único: um rascunho, uma linha, para sempre. */
  test('o identificador do rascunho é único', () => {
    const uniques = getTableConfig(aggregateApplicationAttachments).uniqueConstraints.map(
      (constraint) => constraint.name,
    )

    expect(uniques).toContain('aggregate_application_attachments_draft_id_unique')
  })

  test('tipo e status são lista fechada, e a recusa exige motivo', () => {
    const checks = checkSqlByName(aggregateApplicationAttachments)

    expect(checks['aggregate_application_attachments_type_check']).toContain(
      "in ('address_proof', 'ccmei', 'cnh', 'company_document', 'crlv', 'other')",
    )
    expect(checks['aggregate_application_attachments_status_check']).toContain(
      "in ('pending', 'approved', 'rejected')",
    )
    expect(checks['aggregate_application_attachments_rejection_reason_check']).toContain(
      "= 'rejected'",
    )
  })

  /**
   * Decisão de 2026-08-27: o rascunho é guardado **sem prazo**, porque é o comprovante do que o
   * motorista digitou. O `plan.md` previa `expires_at` e um job de expiração; os dois saíram, e
   * este contrato existe para a coluna não voltar por inércia de quem ler o plano antigo.
   */
  test('não existe coluna de expiração', () => {
    expect(columnNames(aggregateApplicationAttachments)).not.toContain('expires_at')
  })
})
