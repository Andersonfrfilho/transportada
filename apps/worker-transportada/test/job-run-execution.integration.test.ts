/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { DrizzleJobExecutionRepository } from '../src/job-run/infrastructure/drizzle-job-execution.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const db = provider.db

const JOB = 'notification.schedules.run'
const CORRELATION_ID = 'job-run-integration'
const NOW = new Date('2026-08-23T09:00:00.000Z')

type OpenExecutionParams = {
  readonly leaseExpiresAt?: Date
}

async function insertOpenExecution({ leaseExpiresAt }: OpenExecutionParams = {}): Promise<string> {
  const rows = await db.execute(sql`
    insert into job_executions ("job", "origin", "correlation_id", "started_at", "lease_expires_at")
    values (${JOB}, 'schedule', ${CORRELATION_ID}, ${NOW.toISOString()}, ${leaseExpiresAt?.toISOString() ?? null})
    returning "id"
  `)

  const [record] = rows as unknown as { readonly id: string }[]
  if (record === undefined) throw new Error('JOB_EXECUTION_NOT_INSERTED')
  return record.id
}

async function readExecution(executionId: string): Promise<Record<string, unknown>> {
  const rows = await db.execute(sql`
    select "counters", "finished_at", "lease_expires_at", "outcome"
    from job_executions
    where "id" = ${executionId}
  `)

  const [record] = rows as unknown as Record<string, unknown>[]
  if (record === undefined) throw new Error('JOB_EXECUTION_NOT_FOUND')
  return record
}

describeDatabase('job execution claim against Postgres', () => {
  const repository = new DrizzleJobExecutionRepository(db)

  beforeEach(async () => {
    await db.execute(sql`delete from job_executions where "correlation_id" = ${CORRELATION_ID}`)
  })

  afterAll(async () => {
    await db.execute(sql`delete from job_executions where "correlation_id" = ${CORRELATION_ID}`)
    await provider.close()
  })

  test('reivindica a linha aberta e devolve a rotina que a linha diz, não a que o envelope pediu', async () => {
    const executionId = await insertOpenExecution()

    const claimed = await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
      now: NOW,
    })

    expect(claimed).toEqual({ job: JOB, origin: 'schedule' })
    expect(await readExecution(executionId)).toMatchObject({
      lease_expires_at: new Date(NOW.getTime() + 30_000),
    })
  })

  test('a segunda reivindicação com lease vivo não devolve nada — é a reentrega sendo engolida', async () => {
    const executionId = await insertOpenExecution()

    await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
      now: NOW,
    })
    const second = await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
      now: NOW,
    })

    expect(second).toBeUndefined()
  })

  test('lease vencido volta a ser reivindicável — é assim que o processo morto libera o ciclo', async () => {
    const executionId = await insertOpenExecution({
      leaseExpiresAt: new Date(NOW.getTime() - 1_000),
    })

    const claimed = await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
      now: NOW,
    })

    expect(claimed).toEqual({ job: JOB, origin: 'schedule' })
  })

  test('fechar a linha grava o desfecho e devolve o lease a nulo, que é o que o CHECK exige', async () => {
    const executionId = await insertOpenExecution()
    await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
      now: NOW,
    })

    await repository.finish({
      counters: { schedulesEnqueued: 4 },
      executionId,
      finishedAt: new Date(NOW.getTime() + 5_000),
      outcome: 'succeeded',
    })

    expect(await readExecution(executionId)).toMatchObject({
      counters: { schedulesEnqueued: 4 },
      finished_at: new Date(NOW.getTime() + 5_000),
      lease_expires_at: null,
      outcome: 'succeeded',
    })
  })

  test('linha fechada não é reivindicável de novo', async () => {
    const executionId = await insertOpenExecution()
    await repository.finish({
      counters: {},
      executionId,
      finishedAt: new Date(NOW.getTime() + 5_000),
      outcome: 'succeeded',
    })

    const claimed = await repository.claim({
      executionId,
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
      now: NOW,
    })

    expect(claimed).toBeUndefined()
  })

  test('fechar duas vezes não reescreve o desfecho da primeira', async () => {
    const executionId = await insertOpenExecution()
    await repository.finish({
      counters: { schedulesEnqueued: 4 },
      executionId,
      finishedAt: new Date(NOW.getTime() + 5_000),
      outcome: 'succeeded',
    })

    await repository.finish({
      counters: {},
      executionId,
      finishedAt: new Date(NOW.getTime() + 9_000),
      outcome: 'unexpected_error',
    })

    expect(await readExecution(executionId)).toMatchObject({
      counters: { schedulesEnqueued: 4 },
      outcome: 'succeeded',
    })
  })

  test('o banco recusa uma segunda linha aberta da mesma rotina', async () => {
    await insertOpenExecution()

    let refused = false
    try {
      await insertOpenExecution()
    } catch {
      refused = true
    }

    expect(refused).toBe(true)
  })
})
