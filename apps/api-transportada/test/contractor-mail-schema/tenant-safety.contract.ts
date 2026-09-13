/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  contractorContacts,
  contractorMailMessages,
  contractorMailSettings,
  contractorMailThreads,
} from '../../src/database/database.schema.js'
import { foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'
import { buildContractorMailThreadByReplyTokenFilters } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'

const dialect = new PgDialect()

describe('contractor mail tenant safety (spec 143, T005)', () => {
  test('anchors the settings to a company, one configuration per company', () => {
    expect(foreignKeys(contractorMailSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'contractor_mail_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(uniqueColumnsByName(contractorMailSettings)).toMatchObject({
      contractor_mail_settings_company_id_unique: ['company_id'],
    })
  })

  test('reaches the contact and its contractor through the tenant, never by id alone', () => {
    expect(foreignKeys(contractorContacts)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'contractor_contacts_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(contractorContacts)).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: 'contractor_contacts_contractor_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('reaches the conversation and its contractor through the tenant, never by id alone', () => {
    expect(foreignKeys(contractorMailThreads)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'contractor_mail_threads_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(contractorMailThreads)).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: 'contractor_mail_threads_contractor_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(uniqueColumnsByName(contractorMailThreads)).toMatchObject({
      contractor_mail_threads_company_id_id_unique: ['company_id', 'id'],
    })
  })

  /**
   * O hash do token é único GLOBAL, não por empresa (plan.md § Dados): o webhook precisa achar a
   * conversa antes de saber o tenant. É exatamente por isso que essa unicidade sozinha não prova
   * isolamento nenhum — quem prova é o teste seguinte, sobre a consulta real. Esta asserção fixa a
   * âncora deliberada, para não virar "esqueceram o company_id" no diff de alguém que só olhar o
   * schema.
   */
  test('keeps the reply token hash globally unique, on purpose', () => {
    expect(uniqueColumnsByName(contractorMailThreads)).toMatchObject({
      contractor_mail_threads_reply_token_hash_unique: ['reply_token_hash'],
    })
  })

  test('reaches the message and its thread through the tenant, never by id alone', () => {
    expect(foreignKeys(contractorMailMessages)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'contractor_mail_messages_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(contractorMailMessages)).toContainEqual({
      columns: ['company_id', 'thread_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractor_mail_threads',
      name: 'contractor_mail_messages_thread_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  /**
   * plan.md § Segurança e tenant: "O tenant sai do token, conferido contra o webhook. O hash do
   * token acha a conversa, e a conversa dá o company_id, que precisa ser o mesmo da configuração
   * que o webhookId achou." Um token de conversa de **outra** empresa não pode achar nada — a
   * consulta por `reply_token_hash` leva `company_id` na mesma condição, e não confia só no hash
   * global único de cima.
   */
  test('the reply token lookup filters by company id besides the hash', () => {
    const companyId = '00000000-0000-4000-8000-000000000901'
    const replyTokenHash = 'a'.repeat(64)

    const query = dialect.sqlToQuery(
      and(...buildContractorMailThreadByReplyTokenFilters({ companyId, replyTokenHash }))!,
    )

    expect(query.sql).toContain('"contractor_mail_threads"."company_id" = $')
    expect(query.sql).toContain('"contractor_mail_threads"."reply_token_hash" = $')
    expect(query.params).toEqual([companyId, replyTokenHash])
  })

  /**
   * Exceção declarada, no molde do fleet-schema tenant-safety (tabelas tenant-less "de propósito"):
   * `findSettingsByWebhookId` é o único método do repositório sem `companyId` de entrada, porque é
   * ele que descobre a empresa a partir do `webhookId` opaco da URL anônima. Este teste trava o
   * comentário que justifica isso, para a ausência não virar "esqueceram o companyId" no diff de
   * alguém que só olhar a assinatura do método.
   */
  test('declares findSettingsByWebhookId as the one lookup without companyId, on purpose', () => {
    const source = readFileSync(
      new URL(
        '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain('Única busca sem `companyId` de entrada')
    expect(source).toContain('findSettingsByWebhookId')
  })
})
