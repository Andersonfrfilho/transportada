/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { tripDocumentEvents } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

/**
 * ADR-0043 §4: nenhuma coluna de PII na trilha de transição. Nem dado do destinatário, nem dado
 * pessoal do ator além do id opaco — o próprio nome/documento do ator mora em outra tabela,
 * resolvido por join quando alguém precisa exibi-lo, nunca duplicado aqui.
 */
const PII_COLUMN_NAME_FRAGMENTS = [
  'name',
  'nome',
  'tax_id',
  'cpf',
  'cnpj',
  'phone',
  'telefone',
  'email',
  'address',
  'endereco',
  'endereço',
] as const

describe('trip document events (ADR-0043 §4)', () => {
  test('records who, when and to which status, never who is not opaque', () => {
    const required = requiredColumnNames(tripDocumentEvents)
    expect(required).toContain('to_status')
    expect(required).toContain('actor_user_id')
    expect(required).toContain('occurred_at')
    // from_status é nulo em toda outra tabela do módulo — mas nunca em toda coluna do banco,
    // então a checagem de obrigatoriedade fica no NEEDS CLARIFICATION do domínio (T006/T008), não
    // aqui: a tabela só garante que, quando presente, ele é um estado válido.
    expect(columnNames(tripDocumentEvents)).toContain('from_status')
  })

  test('has no PII column, by name', () => {
    const names = columnNames(tripDocumentEvents)
    for (const column of names) {
      for (const fragment of PII_COLUMN_NAME_FRAGMENTS) {
        expect(column).not.toContain(fragment)
      }
    }
  })

  test('anchors to the tenant, to the document and to a member of that same company', () => {
    expect(foreignKeys(tripDocumentEvents)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'trip_document_events_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripDocumentEvents)).toContainEqual({
      columns: ['company_id', 'trip_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trip_documents',
      name: 'trip_document_events_company_document_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripDocumentEvents)).toContainEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'trip_document_events_actor_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('checks both statuses against the same enumeration', () => {
    const checks = checkSqlByName(tripDocumentEvents)
    for (const status of ['pending', 'separated', 'loaded', 'delivered', 'returned']) {
      expect(checks.trip_document_events_from_status_check).toContain(`'${status}'`)
      expect(checks.trip_document_events_to_status_check).toContain(`'${status}'`)
    }
    expect(checks.trip_document_events_from_status_check).toContain('is null or')
  })

  test('never records a transition to the same status it came from', () => {
    const checks = checkSqlByName(tripDocumentEvents)
    expect(checks.trip_document_events_actual_transition_check).toContain('is distinct from')
  })

  test('is append-only: no updated_at, because no event is ever revised', () => {
    expect(columnNames(tripDocumentEvents)).not.toContain('updated_at')
  })
})
