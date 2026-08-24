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

describeDatabase('job execution lease renewal against Postgres', () => {
  const repository = new DrizzleJobExecutionRepository(db)

  beforeEach(async () => {
    await db.execute(sql`delete from job_executions where "correlation_id" = ${CORRELATION_ID}`)
  })

  afterAll(async () => {
    await db.execute(sql`delete from job_executions where "correlation_id" = ${CORRELATION_ID}`)
    // Último bloco do arquivo: fechar antes deixaria os testes seguintes sem conexão.
    await provider.close()
  })

  test('renovar empurra o prazo e devolve o pedido de parada da mesma linha', async () => {
    const executionId = await insertOpenExecution()
    const firstLease = new Date(NOW.getTime() + 30_000)
    await repository.claim({ executionId, leaseExpiresAt: firstLease, now: NOW })

    const secondLease = new Date(NOW.getTime() + 40_000)
    const renewed = await repository.renew({
      executionId,
      expectedLeaseExpiresAt: firstLease,
      leaseExpiresAt: secondLease,
    })

    expect(renewed).toEqual({ cancelRequestedAt: undefined })
    expect(await readExecution(executionId)).toMatchObject({ lease_expires_at: secondLease })
  })

  test('o pedido de parada gravado na linha volta no mesmo batimento', async () => {
    const executionId = await insertOpenExecution()
    const lease = new Date(NOW.getTime() + 30_000)
    await repository.claim({ executionId, leaseExpiresAt: lease, now: NOW })

    const cancelRequestedAt = new Date(NOW.getTime() + 7_000)
    await db.execute(sql`
      update job_executions set "cancel_requested_at" = ${cancelRequestedAt.toISOString()}
      where "id" = ${executionId}
    `)

    const renewed = await repository.renew({
      executionId,
      expectedLeaseExpiresAt: lease,
      leaseExpiresAt: new Date(NOW.getTime() + 40_000),
    })

    expect(renewed?.cancelRequestedAt).toEqual(cancelRequestedAt)
  })

  test('lease que já não é o nosso não é renovado — quem chegou depois fica com a linha', async () => {
    const executionId = await insertOpenExecution()
    const ourLease = new Date(NOW.getTime() + 30_000)
    await repository.claim({ executionId, leaseExpiresAt: ourLease, now: NOW })

    // O processo morreu, o lease venceu e outro worker reivindicou a mesma linha.
    const theirLease = new Date(NOW.getTime() + 900_000)
    await repository.claim({
      executionId,
      leaseExpiresAt: theirLease,
      now: new Date(NOW.getTime() + 600_000),
    })

    const renewed = await repository.renew({
      executionId,
      expectedLeaseExpiresAt: ourLease,
      leaseExpiresAt: new Date(NOW.getTime() + 40_000),
    })

    expect(renewed).toBeUndefined()
    expect(await readExecution(executionId)).toMatchObject({ lease_expires_at: theirLease })
  })

  test('linha já fechada não renova: o batimento do processo atrasado não a reabre', async () => {
    const executionId = await insertOpenExecution()
    const lease = new Date(NOW.getTime() + 30_000)
    await repository.claim({ executionId, leaseExpiresAt: lease, now: NOW })
    await repository.finish({
      counters: { statesWritten: 3 },
      executionId,
      finishedAt: new Date(NOW.getTime() + 20_000),
      outcome: 'succeeded',
    })

    const renewed = await repository.renew({
      executionId,
      expectedLeaseExpiresAt: lease,
      leaseExpiresAt: new Date(NOW.getTime() + 40_000),
    })

    expect(renewed).toBeUndefined()
    expect(await readExecution(executionId)).toMatchObject({
      lease_expires_at: null,
      outcome: 'succeeded',
    })
  })
})
