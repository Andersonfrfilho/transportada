/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_WATCHER_MAX_ACTIVE,
  OCCURRENCE_WATCHER_MAX_TOTAL,
  OCCURRENCE_WATCHER_STATUSES,
} from '../../src/contractor-mail/domain/occurrence-watcher.constant.js'
import {
  companyOccurrenceWatchers,
  contractorMailMessages,
  contractorOccurrenceWatchers,
} from '../../src/database/database.schema.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261016145700_occurrence_watchers/',
  import.meta.url,
)

describe('spec 267: os responsáveis por ocorrências', () => {
  test('a lista fechada de estados e os tetos', () => {
    expect(OCCURRENCE_WATCHER_STATUSES).toEqual(['active', 'inactive'])
    expect(OCCURRENCE_WATCHER_MAX_ACTIVE).toBe(10)
    expect(OCCURRENCE_WATCHER_MAX_TOTAL).toBe(30)
  })

  test.each([
    ['company', companyOccurrenceWatchers, ['company_id', 'user_id']],
    ['contractor', contractorOccurrenceWatchers, ['company_id', 'contractor_id', 'user_id']],
  ] as const)(
    'a tabela da %s: chave composta, status com CHECK e auditoria de quem mexeu',
    (_, table, key) => {
      const config = getTableConfig(table)
      expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([...key])
      const status = config.columns.find((column) => column.name === 'status')
      expect(status?.notNull).toBe(true)
      expect(status?.default).toBe('active')
      expect(config.checks.map((check) => check.name)).toContain(`${config.name}_status_check`)
      for (const name of ['updated_at', 'updated_by_user_id', 'created_by_user_id']) {
        expect(config.columns.find((column) => column.name === name)?.notNull).toBe(true)
      }
      expect(config.foreignKeys.length).toBeGreaterThanOrEqual(2)
    },
  )

  test('a mensagem guarda a cópia enviada, vazia por padrão', () => {
    const column = getTableConfig(contractorMailMessages).columns.find(
      (candidate) => candidate.name === 'cc_addresses',
    )
    expect(column?.notNull).toBe(true)
    expect(column?.hasDefault).toBe(true)
  })

  test('a migration é aditiva: duas tabelas novas e uma coluna com padrão', () => {
    const sql = readFileSync(new URL('migration.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain('CREATE TABLE "company_occurrence_watchers"')
    expect(sql).toContain('CREATE TABLE "contractor_occurrence_watchers"')
    expect(sql).toContain('ALTER TABLE "contractor_mail_messages" ADD COLUMN "cc_addresses"')
    expect(sql).not.toMatch(/\bDROP\b|DELETE FROM|UPDATE "/u)
  })

  test('o rollback recusa rodar com responsável gravado e limpa o journal', () => {
    const sql = readFileSync(new URL('rollback.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain('DROP TABLE "contractor_occurrence_watchers"')
    expect(sql).toContain('DROP TABLE "company_occurrence_watchers"')
    expect(sql).toContain('DROP COLUMN "cc_addresses"')
    expect(sql).toContain('20261016145700_occurrence_watchers')
  })
})
