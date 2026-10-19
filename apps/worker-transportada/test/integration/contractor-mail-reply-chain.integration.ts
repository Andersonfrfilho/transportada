/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T4.2 (D7), contra Postgres real: `listThreadReferenceIds` devolve os `rfc_message_id` da thread
 * (entrada e saída) em ordem de criação, sem o encaminhamento da 248, sem mensagem sem `rfc_message_id` e
 * sem tocar thread de outra empresa nem outra thread da mesma empresa.
 */
import { createHash } from 'node:crypto'

import { afterAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleContractorMailOutboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('a linha de References da thread (spec 274 D7)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = createDrizzleContractorMailOutboundWorkerRepository(database)

  afterAll(async () => {
    await provider.close?.()
  })

  async function seedThread(): Promise<{ companyId: string; threadId: string }> {
    const companyId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
    )
    await database.execute(sql`
      insert into contractor_mail_threads (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash)
      values (${threadId}, ${companyId}, ${contractorId}, 'document_occurrence', ${crypto.randomUUID()}, ${createHash('sha256').update(threadId).digest('hex')})`)
    return { companyId, threadId }
  }

  async function addMessage(input: {
    readonly companyId: string
    readonly direction: 'inbound' | 'outbound'
    readonly rfc: null | string
    readonly secondsAgo: number
    readonly threadId: string
  }): Promise<string> {
    const id = crypto.randomUUID()
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, delivery_status, from_address, subject, to_addresses, body_text, rfc_message_id, created_at)
      values (${id}, ${input.companyId}, ${input.threadId}, ${input.direction}, ${input.direction === 'outbound' ? 'sent' : null}, 'a@x.example.test', 'Assunto', array['b@x.example.test'], 'corpo', ${input.rfc}, now() - make_interval(secs => ${input.secondsAgo}))`)
    return id
  }

  it('entrada e saída em ordem de criação; sem rfc fora; outra thread e outra empresa não entram', async () => {
    const { companyId, threadId } = await seedThread()
    const other = await seedThread()
    await addMessage({
      companyId,
      direction: 'outbound',
      rfc: '<out2@x>',
      secondsAgo: 10,
      threadId,
    })
    await addMessage({ companyId, direction: 'inbound', rfc: '<in1@x>', secondsAgo: 40, threadId })
    await addMessage({ companyId, direction: 'outbound', rfc: null, secondsAgo: 20, threadId })
    await addMessage({
      companyId,
      direction: 'outbound',
      rfc: '<out1@x>',
      secondsAgo: 30,
      threadId,
    })
    await addMessage({ companyId, direction: 'outbound', rfc: '', secondsAgo: 5, threadId })
    await addMessage({ ...other, direction: 'inbound', rfc: '<alheia@x>', secondsAgo: 1 })

    expect(await repository.listThreadReferenceIds({ companyId, threadId })).toEqual([
      '<in1@x>',
      '<out1@x>',
      '<out2@x>',
    ])
    expect(
      await repository.listThreadReferenceIds({ companyId: other.companyId, threadId }),
    ).toEqual([])
  })

  it('o encaminhamento da 248 fica fora da linha', async () => {
    const { companyId, threadId } = await seedThread()
    const userId = crypto.randomUUID()
    const keepId = await addMessage({
      companyId,
      direction: 'inbound',
      rfc: '<in1@x>',
      secondsAgo: 30,
      threadId,
    })
    const forwardId = await addMessage({
      companyId,
      direction: 'outbound',
      rfc: '<fwd@x>',
      secondsAgo: 20,
      threadId,
    })
    expect(keepId).not.toBe(forwardId)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(sql`set session_replication_role = replica`)
    try {
      await database.execute(sql`
        insert into occurrence_contractor_reply_deliveries (id, company_id, reply_id, target, trigger, status, address, attachment_id, mail_message_id, actor_user_id, idempotency_key)
        values (${crypto.randomUUID()}, ${companyId}, ${crypto.randomUUID()}, 'note_recipient_email', 'operator', 'queued', 'c@x.example.test', ${crypto.randomUUID()}, ${forwardId}, ${userId}, ${crypto.randomUUID()})`)
    } finally {
      await database.execute(sql`set session_replication_role = origin`)
    }
    await addMessage({
      companyId,
      direction: 'outbound',
      rfc: '<out1@x>',
      secondsAgo: 10,
      threadId,
    })

    expect(await repository.listThreadReferenceIds({ companyId, threadId })).toEqual([
      '<in1@x>',
      '<out1@x>',
    ])
  })
})
