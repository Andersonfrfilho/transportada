/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (D5): o andamento da 266 aceita a coleta de canhoto como causa do evento `system` — `resolved` quando o
 * canhoto da nota é aprovado e `reopened` quando é reprovado — e a coleta ganha a marca da foto enviada. Tudo aditivo: os
 * CHECKs são **relaxados** (a causa nova entra na conta), nenhum dado é reescrito, e o rollback recusa rodar com evento
 * causado pela coleta ou com foto marcada.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_canhoto_pickup_resolution'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('canhoto_pickup_resolution migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a coleta de canhoto resolve e reabre a ocorrência (spec 321 T4)', () => {
  test('colunas novas anuláveis, sem UPDATE, sem DROP de coluna ou tabela', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'ALTER TABLE "trip_occurrence_resolution_events" ADD COLUMN "canhoto_pickup_id" uuid;',
    )
    expect(text).toContain(
      'ALTER TABLE "trip_canhoto_pickups" ADD COLUMN "photo_sent_at" timestamp with time zone;',
    )
    expect(text).toContain(
      'FOREIGN KEY ("company_id","canhoto_pickup_id") REFERENCES "trip_canhoto_pickups"("company_id","id") ON DELETE RESTRICT',
    )
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/DROP (COLUMN|TABLE|INDEX)/u)
  })

  test('os CHECKs do `system` aceitam a coleta como terceira causa e o `reopened` do sistema só com ela', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      `CHECK (("actor_kind" = 'system') = (num_nonnulls("case_event_id", "contractor_reply_id", "canhoto_pickup_id") = 1))`,
    )
    expect(text).toContain(
      'CHECK (num_nonnulls("case_event_id", "contractor_reply_id", "canhoto_pickup_id") <= 1)',
    )
    expect(text).toContain(
      `CHECK ("kind" <> 'reopened' or ("actor_kind" = 'driver' and "conversation_message_id" is not null) or ("actor_kind" = 'system' and "canhoto_pickup_id" is not null))`,
    )
  })

  test('o rollback recusa evento causado pela coleta ou foto marcada e volta os CHECKs da 276', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('WHERE "canhoto_pickup_id" IS NOT NULL')
    expect(text).toContain('WHERE "photo_sent_at" IS NOT NULL')
    expect(text).toContain(
      `CHECK (("actor_kind" = 'system') = (num_nonnulls("case_event_id", "contractor_reply_id") = 1))`,
    )
    expect(text).toContain(
      `CHECK ("kind" <> 'reopened' or ("actor_kind" = 'driver' and "conversation_message_id" is not null))`,
    )
    expect(text).toContain('DROP COLUMN "canhoto_pickup_id";')
    expect(text).toContain('DROP COLUMN "photo_sent_at";')
    expect(text).toContain("'20261111002237_canhoto_pickup_resolution'")
  })
})
