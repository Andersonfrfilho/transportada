/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.4: a migration da rotina é aditiva (CHECK `NOT VALID` + `VALIDATE`, semente pausada) e o
 * rollback apaga as execuções do job, restaura as CHECK sem ele e tira a linha do journal com guarda.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const SUFFIX = '_conversation_audio_transcribe_job'
const JOB = 'conversation.audio.transcribe'

async function read(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) => name.endsWith(SUFFIX))
  if (directory === undefined) throw new Error(`${SUFFIX} migration is required`)
  return {
    directory,
    text: await Bun.file(join(migrationsDirectory.pathname, directory, file)).text(),
  }
}

describe('a migration da rotina de transcrição entra aditiva e pausada (spec 264 T3.4)', () => {
  test('vem depois da migration das tabelas da transcrição', async () => {
    const { directory } = await read('migration.sql')
    expect(directory > '20261012140238_conversation_audio_transcription').toBe(true)
  })

  test('amplia as duas CHECK sem travar e semeia a agenda pausada em 300 s', async () => {
    const { text } = await read('migration.sql')
    const instructions = text.replaceAll(/^--(?!>).*$/gmu, '')
    for (const table of ['job_executions', 'job_schedules']) {
      expect(instructions).toContain(
        `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${table}_job_check";`,
      )
    }
    const added = [...instructions.matchAll(/ADD CONSTRAINT "([^"]+)"[^;]*;/gu)]
    expect(added.map(([, name]) => name)).toEqual([
      'job_executions_job_check',
      'job_schedules_job_check',
    ])
    expect(
      added.every(
        ([statement]) => statement.includes('NOT VALID') && statement.includes(`'${JOB}'`),
      ),
    ).toBe(true)
    expect(instructions).toContain(
      `INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES\n\t('${JOB}', 300, now(), false, now(), 'system');`,
    )
    expect(instructions).not.toMatch(/\bUPDATE "|\bTRUNCATE\b|\bDROP (?:TABLE|COLUMN|INDEX)\b/u)
  })

  test('o rollback apaga o job, restaura as CHECK sem ele e limpa o journal com guarda', async () => {
    const { directory, text } = await read('rollback.sql')
    const restored = text.slice(
      text.indexOf('ALTER TABLE "job_schedules" DROP CONSTRAINT'),
      text.indexOf('DO $$'),
    )
    expect(text.indexOf(`DELETE FROM "job_executions" WHERE "job" = '${JOB}'`)).toBeGreaterThan(-1)
    expect(text.indexOf(`DELETE FROM "job_schedules" WHERE "job" = '${JOB}'`)).toBeGreaterThan(-1)
    expect(restored).toContain('"job_executions_job_check"')
    expect(restored).not.toContain(`'${JOB}'`)
    expect(restored).toContain(`'trip.canhoto.read'`)
    expect(text).toContain(`"name" = '${directory}'`)
    expect(text).toContain('deleted_migrations <> 1')
  })
})

describe('a migration do índice de expurgo da transcrição entra aditiva (spec 264 revisão M5)', () => {
  const PURGE_SUFFIX = '_conversation_audio_transcription_purge_index'

  async function readPurge(file: string): Promise<{ directory: string; text: string }> {
    const directory = (await listMigrationDirectories()).find((name) => name.endsWith(PURGE_SUFFIX))
    if (directory === undefined) throw new Error(`${PURGE_SUFFIX} migration is required`)
    return {
      directory,
      text: await Bun.file(join(migrationsDirectory.pathname, directory, file)).text(),
    }
  }

  test('é só um índice parcial sobre as linhas ready com texto, depois da migration do job', async () => {
    const { directory, text } = await readPurge('migration.sql')
    const instructions = text.replaceAll(/^--(?!>).*$/gmu, '').trim()
    expect(directory > '20261012154238_conversation_audio_transcribe_job').toBe(true)
    expect(instructions).toBe(
      `CREATE INDEX "occurrence_conversation_audio_transcriptions_purge_idx" ON "occurrence_conversation_audio_transcriptions" ("company_id","attachment_id") WHERE "status" = 'ready' and "text" is not null;`,
    )
  })

  test('o rollback derruba o índice e limpa o journal com guarda', async () => {
    const { directory, text } = await readPurge('rollback.sql')
    expect(text).toContain('DROP INDEX "occurrence_conversation_audio_transcriptions_purge_idx"')
    expect(text).toContain(`"name" = '${directory}'`)
    expect(text).toContain('deleted_migrations <> 1')
  })
})
