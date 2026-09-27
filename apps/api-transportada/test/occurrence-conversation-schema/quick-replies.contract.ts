/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as respostas rápidas da empresa, por público (`contractor` | `driver`),
 * ordenáveis e ativáveis, com teto de 500 caracteres. Ancoradas na empresa como o resto do schema; a
 * regra do texto e do público mora também no banco, porque o cadastro é da empresa inteira e passa
 * por mais de uma tela.
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { companyQuickReplies } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

const MIGRATIONS = new URL('../../drizzle/', import.meta.url)

function migrationFile(file: 'migration.sql' | 'rollback.sql' | 'snapshot.json'): string {
  const directory = readdirSync(MIGRATIONS).find((name) => name.endsWith('_company_quick_replies'))
  if (directory === undefined) throw new Error('EXPECTED_MIGRATION')
  return readFileSync(new URL(`${directory}/${file}`, MIGRATIONS), 'utf8')
}

describe('as respostas rápidas (spec 183 T701)', () => {
  test('nascem ancoradas na empresa, com restrict, e com id e horários do schema', () => {
    expect(foreignKeys(companyQuickReplies)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      }),
    )
    expect(requiredColumnNames(companyQuickReplies)).toEqual(
      expect.arrayContaining(['company_id', 'audience', 'body_text', 'position', 'active']),
    )
    expectGeneratedUuidPrimaryKey(companyQuickReplies)
    expectRequiredUtcTimestamps(companyQuickReplies)
  })

  test('o público é fechado, o texto tem de 1 a 500 caracteres e a posição não é negativa', () => {
    const checks = checkSqlByName(companyQuickReplies)

    expect(checks.company_quick_replies_audience_check).toContain("'contractor'")
    expect(checks.company_quick_replies_audience_check).toContain("'driver'")
    expect(checks.company_quick_replies_body_text_check).toContain('500')
    expect(checks.company_quick_replies_body_text_check).toContain('btrim')
    expect(checks.company_quick_replies_position_check).toContain('>= 0')
  })

  test('a leitura do compositor e da tela é pela empresa, pelo público e pela ordem', () => {
    expect(
      indexColumnsByName(companyQuickReplies).company_quick_replies_audience_position_idx,
    ).toEqual(['company_id', 'audience', 'position'])
  })

  test('a migration é aditiva, tem rollback e snapshot', () => {
    const migration = migrationFile('migration.sql')

    expect(migration).toContain('CREATE TABLE "company_quick_replies"')
    expect(migration).not.toMatch(/DROP|ALTER TABLE "(?!company_quick_replies)/u)
    expect(migrationFile('rollback.sql')).toContain('DROP TABLE IF EXISTS "company_quick_replies"')
    expect(JSON.parse(migrationFile('snapshot.json'))).toBeTruthy()
  })
})

/**
 * Tenant-safety por texto de fonte: toda leitura e escrita das respostas rápidas filtra pela
 * empresa do contexto — o id sozinho alcançaria a resposta de outra empresa.
 */
describe('quick replies query tenant safety (spec 183 T701)', () => {
  const source = readFileSync(
    new URL(
      '../../src/occurrence-conversation/infrastructure/drizzle-quick-replies.repository.ts',
      import.meta.url,
    ),
    'utf8',
  )

  test('filters every select and write by the tenant of the context', () => {
    const wheres = source.split('.where(').slice(1)

    expect(wheres.length).toBeGreaterThanOrEqual(5)
    for (const where of wheres)
      expect(where.slice(0, 200)).toInclude('companyQuickReplies.companyId')
  })
})
