/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { CONTRACTOR_MAIL_TRANSPORTS } from '../../src/contractor-mail/domain/contractor-mail.constant.js'
import { contractorMailMessages } from '../../src/database/database.schema.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261016125229_contractor_mail_message_transport/',
  import.meta.url,
)

describe('spec 268: o transporte da mensagem de e-mail da contratante', () => {
  test('a lista fechada tem Resend e SMTP de sandbox', () => {
    expect(CONTRACTOR_MAIL_TRANSPORTS).toEqual(['resend', 'sandbox_smtp'])
  })

  test('a coluna é obrigatória, com padrão resend e CHECK pela lista', () => {
    const config = getTableConfig(contractorMailMessages)
    const column = config.columns.find((candidate) => candidate.name === 'transport')
    expect(column?.notNull).toBe(true)
    expect(column?.default).toBe('resend')
    expect(config.checks.map((check) => check.name)).toContain(
      'contractor_mail_messages_transport_check',
    )
  })

  test('a migration é aditiva: coluna com padrão e CHECK, sem tocar dado', () => {
    const sql = readFileSync(new URL('migration.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain('ADD COLUMN "transport" varchar(16) DEFAULT \'resend\' NOT NULL')
    expect(sql).toContain("CHECK (\"transport\" in ('resend', 'sandbox_smtp'))")
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE/u)
  })

  test('o rollback recusa rodar com mensagem de sandbox na fila e limpa o journal', () => {
    const sql = readFileSync(new URL('rollback.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(sql).toContain("'sandbox_smtp'")
    expect(sql).toContain('DROP COLUMN "transport"')
    expect(sql).toContain('20261016125229_contractor_mail_message_transport')
  })
})
