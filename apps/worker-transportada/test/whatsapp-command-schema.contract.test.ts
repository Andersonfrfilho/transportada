/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A cópia só vale enquanto os nomes batem com a tabela da API: coluna com nome errado aqui compila e
 * devolve `column does not exist` só na primeira liquidação.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  whatsAppCommandDocuments,
  whatsAppCommandRequests,
} from '../src/database/whatsapp-command.schema.js'

const columnNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

describe('whatsapp command schema copy', () => {
  test('carries only what the settlement reads from the frozen request', () => {
    expect(getTableConfig(whatsAppCommandRequests).name).toBe('whatsapp_command_requests')
    expect(columnNames(whatsAppCommandRequests)).toEqual([
      'id',
      'company_id',
      'actor_user_id',
      'due_date',
      'status',
      'expires_at',
      'confirmed_at',
    ])
  })

  test('carries only what the settlement reads from the journal', () => {
    expect(getTableConfig(whatsAppCommandDocuments).name).toBe('whatsapp_command_documents')
    expect(columnNames(whatsAppCommandDocuments)).toEqual([
      'id',
      'company_id',
      'request_id',
      'document_kind',
      'status',
      'document_id',
    ])
  })

  test('declares no constraint the worker could believe it creates', () => {
    for (const table of [whatsAppCommandRequests, whatsAppCommandDocuments]) {
      const config = getTableConfig(table)
      expect(config.checks).toEqual([])
      expect(config.foreignKeys).toEqual([])
      expect(config.uniqueConstraints).toEqual([])
    }
  })
})
