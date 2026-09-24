/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T301 (RF5, D6): `contractor_contacts` ganha nome, setor, telefone, tipos, grupos de
 * ocorrência, o aceite do WhatsApp e o canal preferido — **aditiva**: nenhuma coluna existente muda
 * de sentido, e `receives_occurrences`/`can_decide` seguem, derivados dos tipos na escrita (T302).
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { contractorContacts } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  indexColumnsByName,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

const MIGRATION_NAME = '20260924163726_contractor_contact_channels'
const MIGRATION_DIRECTORY = new URL(`../../drizzle/${MIGRATION_NAME}/`, import.meta.url)

describe('contatos da contratante com tipos e canais (spec 183 T301)', () => {
  test('as colunas novas existem; as antigas continuam', () => {
    expect(columnNames(contractorContacts)).toEqual(
      expect.arrayContaining([
        'name',
        'role_label',
        'phone',
        'types',
        'occurrence_stages',
        'whatsapp_opt_in_at',
        'whatsapp_opt_in_by_user_id',
        'preferred_channel',
        'receives_occurrences',
        'can_decide',
        'email',
      ]),
    )
  })

  test('nome, tipos, grupos e canal preferido nunca ficam nulos; telefone e aceite podem', () => {
    const required = requiredColumnNames(contractorContacts)
    expect(required).toEqual(
      expect.arrayContaining([
        'name',
        'role_label',
        'types',
        'occurrence_stages',
        'preferred_channel',
      ]),
    )
    for (const optional of ['phone', 'whatsapp_opt_in_at', 'whatsapp_opt_in_by_user_id']) {
      expect(required).not.toContain(optional)
    }
  })

  test('tipos e grupos são conjuntos fechados; canal é e-mail ou WhatsApp', () => {
    const checks = checkSqlByName(contractorContacts)
    for (const type of ['occurrences', 'approves_charges', 'scheduling', 'invoices', 'cte_xml']) {
      expect(checks.contractor_contacts_types_check).toContain(`'${type}'`)
    }
    for (const stage of ['separation', 'delivery', 'stop']) {
      expect(checks.contractor_contacts_occurrence_stages_check).toContain(`'${stage}'`)
    }
    expect(checks.contractor_contacts_preferred_channel_check).toContain("'email'")
    expect(checks.contractor_contacts_preferred_channel_check).toContain("'whatsapp'")
  })

  test('o telefone segue o formato do WhatsApp verificado, que é o que o webhook compara', () => {
    expect(checkSqlByName(contractorContacts).contractor_contacts_phone_check).toContain(
      '^55[1-9][0-9]{9,10}$',
    )
  })

  test('o aceite anda com o autor, e WhatsApp preferido exige aceite e telefone (D6)', () => {
    const checks = checkSqlByName(contractorContacts)
    expect(checks.contractor_contacts_whatsapp_opt_in_pair_check).toContain('whatsapp_opt_in_at')
    expect(checks.contractor_contacts_whatsapp_opt_in_pair_check).toContain(
      'whatsapp_opt_in_by_user_id',
    )
    expect(checks.contractor_contacts_whatsapp_opt_in_phone_check).toContain('phone')
    expect(checks.contractor_contacts_preferred_whatsapp_check).toContain('whatsapp_opt_in_at')
  })

  test('o webhook acha o contato pelo telefone dentro da empresa', () => {
    expect(indexColumnsByName(contractorContacts).contractor_contacts_company_phone_idx).toEqual([
      'company_id',
      'phone',
    ])
  })

  test('a migration preenche tipos pelos campos antigos e o rollback desfaz tudo', () => {
    expect(readdirSync(MIGRATION_DIRECTORY).sort()).toEqual([
      'migration.sql',
      'rollback.sql',
      'snapshot.json',
    ])
    const migration = readFileSync(new URL('migration.sql', MIGRATION_DIRECTORY), 'utf8')
    expect(migration).toContain('"receives_occurrences"')
    expect(migration).toContain('"can_decide"')
    expect(migration).toContain("'occurrences'")
    expect(migration).toContain("'approves_charges'")
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu)

    const rollback = readFileSync(new URL('rollback.sql', MIGRATION_DIRECTORY), 'utf8')
    for (const column of [
      'name',
      'role_label',
      'phone',
      'types',
      'occurrence_stages',
      'whatsapp_opt_in_at',
      'whatsapp_opt_in_by_user_id',
      'preferred_channel',
    ]) {
      expect(rollback).toContain(`DROP COLUMN "${column}"`)
    }
    expect(rollback).toContain(MIGRATION_NAME)
    expect(rollback).not.toContain('DROP COLUMN "email"')
  })
})
