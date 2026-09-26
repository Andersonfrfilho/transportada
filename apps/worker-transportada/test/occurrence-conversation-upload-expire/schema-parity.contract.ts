/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c2: a cópia de `occurrence_conversation_uploads` no worker. Coluna renomeada na API e
 * não aqui é `UPDATE` que falha em produção, e o pedido vencido fica sem quem o feche.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { occurrenceConversationUploads } from '../../src/database/occurrence-conversation.schema.js'

const WORKER = new URL('../../src/database/occurrence-conversation.schema.ts', import.meta.url)
const API = new URL(
  '../../../api-transportada/src/database/occurrence-conversation.schema.ts',
  import.meta.url,
)
const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|text|integer|timestamp)\(.*,$/u

describe('occurrence conversation uploads mirror parity (spec 183 T702c2)', () => {
  test('cada coluna que a cópia declara está igual na API', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])
    const table = worker.slice(worker.indexOf("pgTable('occurrence_conversation_uploads'"))
    const columns = table
      .slice(0, table.indexOf('\n})'))
      .split('\n')
      .filter((line) => COLUMN_LINE.test(line))
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('companyId:'))

    expect(columns.length).toBe(5)
    for (const column of columns) expect(api).toInclude(column)
  })

  test('aponta para a tabela que a API migra, com as colunas que a rotina lê e grava', () => {
    const config = getTableConfig(occurrenceConversationUploads)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('occurrence_conversation_uploads')
    for (const column of ['id', 'company_id', 'bucket', 'object_key', 'status', 'expires_at']) {
      expect(names).toContain(column)
    }
  })
})
