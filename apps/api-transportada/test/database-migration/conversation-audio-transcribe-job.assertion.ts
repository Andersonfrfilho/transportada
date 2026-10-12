/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.4: a agenda de `conversation.audio.transcribe` nasce pausada em 300 s, e as duas CHECK de `job`
 * aceitam o nome novo e continuam recusando um nome desconhecido. Cada caso volta a transação.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const JOB = 'conversation.audio.transcribe'

class CaseRolledBack extends Error {}

async function runRolledBack(database: SQL, scenario: (transaction: SQL) => Promise<void>) {
  try {
    await database.begin(async (transaction) => {
      await scenario(transaction)
      throw new CaseRolledBack('rollback do caso')
    })
  } catch (error) {
    if (!(error instanceof CaseRolledBack)) throw error
  }
}

async function assertSeededPaused(database: SQL): Promise<void> {
  const rows = await database<
    Array<{
      enabled: boolean
      interval_seconds: number
      paused_at: Date | null
      paused_origin: string | null
    }>
  >`select enabled, interval_seconds, paused_at, paused_origin from job_schedules where job = ${JOB}`
  expect(rows).toHaveLength(1)
  expect(rows[0]?.interval_seconds).toBe(300)
  expect(rows[0]?.enabled).toBe(false)
  expect(rows[0]?.paused_at).not.toBeNull()
  expect(rows[0]?.paused_origin).toBe('system')
}

async function assertChecks(database: SQL): Promise<void> {
  await runRolledBack(database, async (transaction) => {
    await transaction`insert into job_executions (job, origin, correlation_id) values (${JOB}, 'schedule', 'probe')`
  })
  for (const table of ['job_executions', 'job_schedules'] as const) {
    await runRolledBack(database, async (transaction) => {
      await expectQueryToFail(
        table === 'job_executions'
          ? transaction`insert into job_executions (job, origin, correlation_id) values ('bogus.job', 'schedule', 'probe')`
          : transaction`insert into job_schedules (job, interval_seconds, next_run_at) values ('bogus.job', 300, now())`,
        CHECK_VIOLATION,
        `${table}_job_check`,
      )
    })
  }
}

export async function assertConversationAudioTranscribeJob(database: SQL): Promise<void> {
  await assertSeededPaused(database)
  await assertChecks(database)
}
