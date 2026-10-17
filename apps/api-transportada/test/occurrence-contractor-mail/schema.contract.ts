/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.1 (ADR-0108): o schema e a migration A do bloco "E-mail à contratante" do tipo de ocorrência.
 */
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  companyOccurrenceTypeRecipients,
  companyOccurrenceTypes,
  companyOccurrenceTypeWatchers,
  contractorMailMessages,
} from '../../src/database/database.schema.js'

const MIGRATION = new URL(
  '../../drizzle/20261017041702_occurrence_type_contractor_mail/',
  import.meta.url,
)

describe('spec 271: modelo do e-mail à contratante — schema e migration', () => {
  test('o tipo guarda a chave (varchar 128, sem FK) e o carimbo, com CHECK de chave não vazia', () => {
    const config = getTableConfig(companyOccurrenceTypes)
    const key = config.columns.find(
      (column) => column.name === 'contractor_notification_template_key',
    )
    const selectedAt = config.columns.find(
      (column) => column.name === 'contractor_notification_template_selected_at',
    )
    expect(key?.notNull).toBe(false)
    expect(key?.getSQLType()).toBe('varchar(128)')
    expect(selectedAt?.notNull).toBe(false)
    expect(config.checks.map((check) => check.name)).toContain(
      'company_occurrence_types_contractor_notification_template_key_check',
    )
    const keyForeignKeys = config.foreignKeys.filter((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === key?.name),
    )
    expect(keyForeignKeys).toEqual([])
  })

  test('responsáveis em cópia: FK do tipo e da lista da empresa, ambas cascade e por empresa', () => {
    const config = getTableConfig(companyOccurrenceTypeWatchers)
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'company_id',
      'occurrence_type_id',
      'user_id',
    ])
    const byName = new Map(config.foreignKeys.map((fk) => [fk.getName(), fk]))
    const typeFk = byName.get('company_occurrence_type_watchers_type_fk')
    const watcherFk = byName.get('company_occurrence_type_watchers_company_watcher_fk')
    expect(typeFk?.onDelete).toBe('cascade')
    expect(typeFk?.reference().columns.map((column) => column.name)).toEqual([
      'company_id',
      'occurrence_type_id',
    ])
    expect(watcherFk?.onDelete).toBe('cascade')
    expect(watcherFk?.reference().columns.map((column) => column.name)).toEqual([
      'company_id',
      'user_id',
    ])
  })

  test('destinatários: FK do tipo e do contato, ambas cascade e por empresa', () => {
    const config = getTableConfig(companyOccurrenceTypeRecipients)
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'company_id',
      'occurrence_type_id',
      'contact_id',
    ])
    const byName = new Map(config.foreignKeys.map((fk) => [fk.getName(), fk]))
    const contactFk = byName.get('company_occurrence_type_recipients_contact_fk')
    expect(byName.get('company_occurrence_type_recipients_type_fk')?.onDelete).toBe('cascade')
    expect(contactFk?.onDelete).toBe('cascade')
    expect(contactFk?.reference().columns.map((column) => column.name)).toEqual([
      'company_id',
      'contact_id',
    ])
  })

  test('a mensagem grava a chave e a versão do modelo do módulo, ambas opcionais', () => {
    const columns = getTableConfig(contractorMailMessages).columns
    const key = columns.find((column) => column.name === 'notification_template_key')
    const version = columns.find((column) => column.name === 'notification_template_version')
    expect(key?.notNull).toBe(false)
    expect(key?.getSQLType()).toBe('varchar(128)')
    expect(version?.notNull).toBe(false)
    expect(version?.getSQLType()).toBe('integer')
  })

  test('a migration é aditiva e o rollback desfaz tudo e tira a própria linha do diário', () => {
    const migration = readFileSync(new URL('migration.sql', MIGRATION), 'utf8')
    const rollback = readFileSync(new URL('rollback.sql', MIGRATION), 'utf8')
    expect(migration).not.toMatch(
      /\bdrop\s+(table|column|index|constraint)\b|^\s*(delete|truncate)\b/im,
    )
    for (const table of [
      'company_occurrence_type_watchers',
      'company_occurrence_type_recipients',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`)
      expect(rollback).toContain(`DROP TABLE "${table}"`)
    }
    for (const column of [
      'contractor_notification_template_key',
      'contractor_notification_template_selected_at',
      'notification_template_key',
      'notification_template_version',
    ]) {
      expect(rollback).toContain(`DROP COLUMN "${column}"`)
    }
    expect(migration).toContain(
      'REFERENCES "company_occurrence_watchers"("company_id","user_id") ON DELETE CASCADE',
    )
    expect(rollback).toContain('20261017041702_occurrence_type_contractor_mail')
  })
})
