/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — a rotina contra Postgres de verdade: as cópias de schema do worker precisam casar
 * com as tabelas da API, e uma coluna com nome errado compila e só falha na primeira batida. Aqui a
 * API é falsa; o que se prova é que a rotina chama o gateway com os pedidos certos, na empresa de
 * cada um, e entrega o resumo ao número verificado de quem confirmou.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'
import { createWhatsAppCommandSettlementRoutine } from '../src/whatsapp-command-settlement/application/whatsapp-command-settlement.routine.js'
import { DrizzleSettlementCandidateRepository } from '../src/whatsapp-command-settlement/infrastructure/drizzle-settlement-candidate.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const MINUTE_MS = 60_000
const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }
const CONTEXT: JobRoutineContext = {
  correlationId: 'settlement-integration',
  executionId: 'execution-t014',
  isStopRequested: () => false,
  job: 'whatsapp.command.settle',
  origin: 'schedule',
}

describeDatabase('liquidação dos pedidos de WhatsApp (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const now = new Date()
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const phone = `5516${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`
  const ids = {
    confirmingFresh: crypto.randomUUID(),
    failedFinal: crypto.randomUUID(),
    pendingFresh: crypto.randomUUID(),
    pendingOld: crypto.randomUUID(),
    previewed: crypto.randomUUID(),
    stuck: crypto.randomUUID(),
  }

  async function insertRequest(input: {
    readonly confirmedMinutesAgo?: number
    readonly id: string
    readonly status: string
  }): Promise<void> {
    const confirmedAt =
      input.confirmedMinutesAgo === undefined
        ? null
        : new Date(now.getTime() - input.confirmedMinutesAgo * MINUTE_MS).toISOString()
    await db.execute(sql`
      insert into whatsapp_command_requests
        (id, company_id, actor_user_id, membership_id, kind, selection, classification,
         preview_sha256, status, expires_at, confirmed_at)
      values (
        ${input.id}, ${companyId}, ${userId}, ${membershipId}, 'document_issuance', '[]'::jsonb,
        '[]'::jsonb, ${'b'.repeat(64)}, ${input.status},
        ${new Date(now.getTime() + 15 * MINUTE_MS).toISOString()}, ${confirmedAt}
      )
    `)
  }

  async function insertStep(input: {
    readonly kind: string
    readonly requestId: string
    readonly status: string
  }): Promise<void> {
    await db.execute(sql`
      insert into whatsapp_command_documents
        (company_id, request_id, document_kind, group_key, idempotency_key, status)
      values (
        ${companyId}, ${input.requestId}, ${input.kind}, 'group-t014',
        ${`whatsapp:${input.requestId}:${input.kind}`}, ${input.status}
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into user_whatsapp_phones (user_id, phone, verified_at)
      values (${userId}, ${phone}, ${now.toISOString()})
    `)
    await insertRequest({ confirmedMinutesAgo: 10, id: ids.failedFinal, status: 'dispatched' })
    await insertStep({ kind: 'cte_batch', requestId: ids.failedFinal, status: 'failed' })
    // Nove, não dez: empatado com o de cima, a ordem cairia no id, que é UUID sorteado.
    await insertRequest({ confirmedMinutesAgo: 9, id: ids.pendingFresh, status: 'dispatched' })
    await insertStep({ kind: 'nfse_invoice', requestId: ids.pendingFresh, status: 'pending' })
    await insertRequest({ confirmedMinutesAgo: 180, id: ids.pendingOld, status: 'dispatched' })
    await insertStep({ kind: 'nfse_invoice', requestId: ids.pendingOld, status: 'pending' })
    await insertRequest({ confirmedMinutesAgo: 30, id: ids.stuck, status: 'confirming' })
    await insertRequest({ confirmedMinutesAgo: 2, id: ids.confirmingFresh, status: 'confirming' })
    await insertRequest({ id: ids.previewed, status: 'previewed' })
  })

  afterAll(async () => {
    await db.execute(sql`delete from whatsapp_command_requests where company_id = ${companyId}`)
    await db.execute(sql`delete from user_whatsapp_phones where user_id = ${userId}`)
    await db.execute(sql`delete from user_company_memberships where id = ${membershipId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  test('a fonte devolve só o trabalho em curso, com o estado de cada documento', async () => {
    const repository = new DrizzleSettlementCandidateRepository(db)
    const candidates = await repository.listCandidates({
      limit: 1000,
      stuckConfirmingBefore: new Date(now.getTime() - 15 * MINUTE_MS),
    })
    const ours = candidates.filter((candidate) => candidate.companyId === companyId)

    expect(ours.map((candidate) => [candidate.id, candidate.status, candidate.documents])).toEqual([
      [ids.pendingOld, 'dispatched', ['pending']],
      [ids.stuck, 'confirming', []],
      [ids.failedFinal, 'dispatched', ['failure']],
      [ids.pendingFresh, 'dispatched', ['pending']],
    ])
    const verifiedSince = new Date(now.getTime() - 90 * 86_400_000)
    expect(await repository.findVerifiedPhone({ userId, verifiedSince })).toBe(phone)
    // T014b (M2): verificação anterior ao corte é número vencido, e o resumo não sai para ele.
    const afterVerification = new Date(now.getTime() + MINUTE_MS)
    expect(
      await repository.findVerifiedPhone({ userId, verifiedSince: afterVerification }),
    ).toBeUndefined()
  })

  test('a rotina chama a API com os pedidos certos e entrega o resumo ao número verificado', async () => {
    const calls: Record<string, string>[] = []
    const sent: Record<string, string>[] = []
    const repository = new DrizzleSettlementCandidateRepository(db)
    const routine = createWhatsAppCommandSettlementRoutine({
      api: {
        async settle(input) {
          calls.push(input)
          return input.requestId === ids.failedFinal
            ? { message: 'Resultado do pedido', outcome: 'settled' }
            : { message: undefined, outcome: 'waiting' }
        },
      },
      candidates: repository,
      logger: SILENT_LOGGER,
      now: () => now,
      recipients: repository,
      sender: {
        async sendText(input) {
          sent.push(input)
        },
      },
    })

    await routine.run(CONTEXT)

    expect(calls.filter((call) => call.companyId === companyId)).toEqual([
      { companyId, hint: 'settle_partial', requestId: ids.pendingOld },
      { companyId, hint: 'resume', requestId: ids.stuck },
      { companyId, hint: 'settle', requestId: ids.failedFinal },
    ])
    expect(sent.filter((message) => message.companyId === companyId)).toEqual([
      { body: 'Resultado do pedido', companyId, to: phone },
    ])
  })
})
