/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3b (ADR-0101 decisão 5): o protocolo da conversa nasce no banco. Prende a ordem da
 * migration (triggers por último), o alfabeto do TypeScript ao do SQL, a ausência de gerador no código e
 * o rollback que não recusa e declara a perda.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  CONVERSATION_PROTOCOL_ALPHABET,
  CONVERSATION_PROTOCOL_PATTERN,
} from '../../src/shared/occurrence-conversation-subject.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_protocol'
const SOURCE_DIRECTORY = join(import.meta.dir, '../../src')
const ALPHABET_DECLARATION = /protocol_alphabet constant text := '([^']+)'/u

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('conversation_protocol is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--(?!>).*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('o protocolo da conversa é do banco (spec 260 T2.3b)', () => {
  test('o alfabeto do TypeScript é o do trigger e o do CHECK, e o sorteio cobre exatamente os símbolos', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(ALPHABET_DECLARATION.exec(instructions)?.[1]).toBe(CONVERSATION_PROTOCOL_ALPHABET)
    expect(instructions).toContain(`floor(random() * ${CONVERSATION_PROTOCOL_ALPHABET.length})`)
    expect(instructions).toContain(`CHECK ("protocol" ~ '${CONVERSATION_PROTOCOL_PATTERN}')`)

    const pattern = new RegExp(CONVERSATION_PROTOCOL_PATTERN, 'u')
    for (const symbol of CONVERSATION_PROTOCOL_ALPHABET) {
      expect(pattern.test(`261009-${symbol.repeat(4)}`)).toBe(true)
    }
    for (const ambiguous of ['0', '1', 'I', 'L', 'O', 'a', '-']) {
      expect(CONVERSATION_PROTOCOL_ALPHABET).not.toContain(ambiguous)
      expect(pattern.test(`261009-${ambiguous.repeat(4)}`)).toBe(false)
    }
    expect(new Set(CONVERSATION_PROTOCOL_ALPHABET).size).toBe(CONVERSATION_PROTOCOL_ALPHABET.length)
  })

  test('coluna → funções → backfill → CHECK → único → triggers por último', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)
    const order = [
      'ADD COLUMN "protocol" text DEFAULT \'\' NOT NULL',
      'CREATE FUNCTION "conversation_protocol_suffix"',
      'CREATE FUNCTION "assign_occurrence_conversation_protocol"',
      'CREATE FUNCTION "reject_occurrence_conversation_protocol_change"',
      'DO $$',
      'ADD CONSTRAINT "occurrence_conversations_protocol_check"',
      'ADD CONSTRAINT "occurrence_conversations_company_protocol_unique" UNIQUE("company_id","protocol")',
      'CREATE TRIGGER "occurrence_conversations_assign_protocol_trigger"',
      'CREATE TRIGGER "occurrence_conversations_protocol_immutable_trigger"',
    ].map((fragment) => positionOf(instructions, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(instructions.match(/\bVOLATILE\b/gu)).toHaveLength(3)
    expect(instructions).toContain("AT TIME ZONE 'America/Sao_Paulo'")
    expect(instructions).toContain('BEFORE INSERT ON "occurrence_conversations"')
    expect(instructions).toContain('BEFORE UPDATE OF "protocol" ON "occurrence_conversations"')
    expect(instructions).toContain('IF NEW.protocol IS DISTINCT FROM OLD.protocol THEN')
  })

  test('aditiva: o único UPDATE é o do backfill e nada de dado é apagado', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/\bUPDATE "/gu)).toHaveLength(1)
    expect(instructions).not.toMatch(/\bDELETE FROM\b|\bDROP (?:TABLE|COLUMN|CONSTRAINT)\b/u)
    expect(instructions.match(/\bDROP INDEX\b/gu)).toHaveLength(1)
    expect(instructions).toContain('DROP INDEX "occurrence_conversations_protocol_backfill_idx"')
  })

  test('nenhum código da aplicação gera ou usa o alfabeto do protocolo', async () => {
    const offenders: string[] = []
    for await (const file of new Bun.Glob('**/*.ts').scan({ cwd: SOURCE_DIRECTORY })) {
      if (file === 'shared/occurrence-conversation-subject.constant.ts') continue
      const content = await Bun.file(join(SOURCE_DIRECTORY, file)).text()
      if (content.includes('CONVERSATION_PROTOCOL_ALPHABET')) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  test('o rollback não recusa, declara a perda e fecha o journal contado', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      "SET LOCAL lock_timeout = '3s';",
      'DROP TRIGGER "occurrence_conversations_protocol_immutable_trigger"',
      'DROP TRIGGER "occurrence_conversations_assign_protocol_trigger"',
      'DROP FUNCTION "reject_occurrence_conversation_protocol_change"()',
      'DROP FUNCTION "assign_occurrence_conversation_protocol"()',
      'DROP FUNCTION "conversation_protocol_suffix"()',
      'DROP CONSTRAINT "occurrence_conversations_company_protocol_unique"',
      'DROP CONSTRAINT "occurrence_conversations_protocol_check"',
      'DROP COLUMN "protocol"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(text).toContain('PERDA DECLARADA')
    expect(withoutComments(text).match(/RAISE EXCEPTION/gu)).toHaveLength(1)
    expect(withoutComments(text)).not.toMatch(/\bCASCADE\b|\bUPDATE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
