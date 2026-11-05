/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7 (regra 9), contra Postgres real: o boleto da contratante volta ao grupo de onde o pedido saiu. Sem envio ao
 * cliente, o PDF vai ao grupo; com envio ao cliente, só o aviso com o contato mascarado. O retorno com o escritório ou
 * vencido avisa uma vez. Duas passadas ao mesmo tempo mandam uma vez só; falha tenta de novo até desistir.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  occurrenceContractorReplies,
  tripFieldReports,
  whatsappGroupRequests,
} from '../../src/database/database.schema.js'
import {
  dispatchWhatsAppGroupBoletoReturns,
  GROUP_BOLETO_RETURN_MAX_ATTEMPTS,
  GROUP_BOLETO_RETURN_TEXT,
  maskGroupBoletoContact,
  syncWhatsAppGroupRequestTranscripts,
  type GroupBoletoReturnSender,
  type GroupBoletoReturnSummary,
} from '../../src/occurrence-conversation/infrastructure/whatsapp-group-boleto-return.support.js'
import { createGroupBoletoResendPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-boleto-resend.adapter.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const GROUP = '120363000000000001@g.us'
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

type Sent =
  | { readonly caption: string; readonly kind: 'document'; readonly number: string }
  | { readonly body: string; readonly kind: 'text'; readonly number: string }

function fakeSender(behaviour: 'fail' | 'ok' = 'ok') {
  const sent: Sent[] = []
  const sender: GroupBoletoReturnSender = {
    sendDocument: async ({ caption, number }) => {
      if (behaviour === 'fail') throw new Error('evolution down')
      // Um respiro: a passada concorrente teria tempo de mandar de novo, se a trava falhasse.
      await new Promise((resolve) => setTimeout(resolve, 20))
      sent.push({ caption, kind: 'document', number })
    },
    sendText: async ({ body, number }) => {
      if (behaviour === 'fail') throw new Error('evolution down')
      await new Promise((resolve) => setTimeout(resolve, 20))
      sent.push({ body, kind: 'text', number })
    },
  }
  return { sender, sent }
}

function pass(
  database: TestDatabase,
  sender: GroupBoletoReturnSender,
  companyId?: string,
  now = new Date(),
) {
  return dispatchWhatsAppGroupBoletoReturns(
    { readAttachment: async () => PDF, runner: database.db, sender },
    { ...(companyId === undefined ? {} : { companyId }), now },
  )
}

/**
 * A ocorrência registrada por um pedido do grupo: o pedido fechado e a chave dele em `trip_field_reports`, como o
 * fluxo do grupo grava. `linked: false` é a ocorrência registrada por outro caminho (app, painel).
 */
async function prepare(
  database: TestDatabase,
  options: {
    readonly linked?: boolean
    readonly transcript?: readonly Record<string, string>[]
  } = {},
) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const now = new Date()
  const [request] = await database.db
    .insert(whatsappGroupRequests)
    .values({
      closedAt: now,
      companyId: company.companyId,
      driverId: company.firstDriverId,
      expiresAt: new Date(now.getTime() + 600_000),
      groupJid: GROUP,
      ownerNumber: '5516991225783',
      state: {
        documentNumber: '899884',
        typeName: 'Prorrogação do boleto',
        ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
      },
      status: 'completed',
      step: 'confirm',
      timeoutSeconds: 600,
    })
    .returning({ id: whatsappGroupRequests.id })
  if (request === undefined) throw new Error('EXPECTED_REQUEST')
  if (options.linked !== false) {
    await database.db.insert(tripFieldReports).values({
      actorUserId: driverUserId,
      channel: 'whatsapp',
      companyId: company.companyId,
      idempotencyKey: `whatsapp-group-request:${request.id}`,
      operation: 'occurrence',
      resultId: seeded.occurrenceId,
    })
  }
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'off',
    note: 'off',
    replyMode: 'forward_automatic',
  })
  return { companyId: company.companyId, conversationId, requestId: request.id, seeded }
}

/** O resumo que a passada monta para a ocorrência semeada: série e destinatário da nota, tipo do pedido. */
async function summaryOf(
  database: TestDatabase,
  companyId: string,
  occurrenceId: string,
): Promise<GroupBoletoReturnSummary> {
  const [row] = (await database.db.execute(sql`
    select note.series,
           coalesce((select coalesce(nullif(participant.legal_name, ''), nullif(participant.trade_name, ''))
                       from nfe_participants participant
                      where participant.company_id = note.company_id and participant.document_id = note.id
                        and participant.role = 'recipient' limit 1), '') as client_name
      from trip_document_occurrences occurrence
      join trip_documents document
        on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
      join nfe_documents note on note.company_id = document.company_id and note.id = document.nfe_document_id
     where occurrence.company_id = ${companyId}::uuid and occurrence.id = ${occurrenceId}::uuid`)) as unknown as readonly {
    client_name: string
    series: string
  }[]
  return {
    clientName: row?.client_name ?? '',
    documentNumber: '899884',
    series: row?.series ?? '',
    typeName: 'Prorrogação do boleto',
  }
}

async function boletoReturnOf(database: TestDatabase, requestId: string) {
  const [row] = await database.db
    .select({ state: whatsappGroupRequests.state })
    .from(whatsappGroupRequests)
    .where(eq(whatsappGroupRequests.id, requestId))
  return (row?.state as { boletoReturn?: Record<string, unknown> } | undefined)?.boletoReturn
}

async function setReplyStatus(
  database: TestDatabase,
  companyId: string,
  occurrenceId: string,
  status: 'needs_operator' | 'overdue',
) {
  await database.db.execute(
    sql`update occurrence_contractor_replies set status = ${status}, reason = ${
      status === 'needs_operator' ? 'document_not_confirmed' : null
    }
        where company_id = ${companyId}::uuid and occurrence_id = ${occurrenceId}::uuid`,
  )
  // Como a aplicação faz: toda mudança de estado do retorno grava o evento (é por ele que a passada sabe que andou).
  await database.db.execute(sql`
    insert into occurrence_contractor_reply_events (company_id, reply_id, from_status, to_status, actor_kind)
    select company_id, id, 'awaiting_contractor', ${status}, 'system'
      from occurrence_contractor_replies
     where company_id = ${companyId}::uuid and occurrence_id = ${occurrenceId}::uuid`)
}

describe('spec 292 T7: o boleto da contratante volta ao grupo do pedido', () => {
  testWithPostgres(
    'cliente sem contato: o PDF vai ao grupo com a NF, uma vez só, mesmo com duas passadas juntas',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId, seeded } = await prepare(database)
        await receivePdfReply(database, { companyId, conversationId })
        const [reply] = await database.db
          .select({ status: occurrenceContractorReplies.status })
          .from(occurrenceContractorReplies)
          .where(
            and(
              eq(occurrenceContractorReplies.companyId, companyId),
              eq(occurrenceContractorReplies.occurrenceId, seeded.occurrenceId),
            ),
          )
        expect(reply?.status).toBe('delivered')

        const summary = await summaryOf(database, companyId, seeded.occurrenceId)
        expect(summary.series).not.toBe('')
        const { sender, sent } = fakeSender()
        const results = await Promise.all([
          pass(database, sender, companyId),
          pass(database, sender, companyId),
        ])
        expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1)
        expect(sent).toEqual([
          { caption: GROUP_BOLETO_RETURN_TEXT.document(summary), kind: 'document', number: GROUP },
        ])
        expect(await boletoReturnOf(database, requestId)).toMatchObject({
          attempts: 1,
          outcome: 'posted_to_group',
          status: 'sent',
        })

        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'cliente recebeu pelo WhatsApp: o grupo recebe só o aviso com o número mascarado, sem o PDF',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId, seeded } = await prepare(database)
        const received = await receivePdfReply(database, { companyId, conversationId })
        const summary = await summaryOf(database, companyId, seeded.occurrenceId)
        await database.db.execute(sql`
          insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, attachment_id, address, idempotency_key, sent_at)
          select company_id, id, 'client_boleto_whatsapp', 'automatic', 'sent', ${received.attachmentId}::uuid,
                 '+5516991225783', 'teste-cliente-whatsapp', now()
            from occurrence_contractor_replies where company_id = ${companyId}::uuid`)

        const { sender, sent } = fakeSender()
        expect(await pass(database, sender)).toEqual({ failed: 0, sent: 1 })
        expect(sent).toEqual([
          {
            body: GROUP_BOLETO_RETURN_TEXT.clientSent(summary, ['(16) •••••-5783']),
            kind: 'text',
            number: GROUP,
          },
        ])
        expect(await boletoReturnOf(database, requestId)).toMatchObject({
          outcome: 'sent_to_client',
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'WhatsApp do cliente ainda saindo: o grupo espera; ocorrência de outro caminho não vai ao grupo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId } = await prepare(database, { linked: false })
        await receivePdfReply(database, { companyId, conversationId })
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toEqual([])
      })
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId } = await prepare(database)
        const received = await receivePdfReply(database, { companyId, conversationId })
        await database.db.execute(sql`
          insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, attachment_id, address, idempotency_key)
          select company_id, id, 'client_boleto_whatsapp', 'automatic', 'queued', ${received.attachmentId}::uuid,
                 '+5516991225783', 'teste-cliente-whatsapp'
            from occurrence_contractor_replies where company_id = ${companyId}::uuid`)
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'vencido e com o escritório: um aviso de cada, uma vez; quando chega, o PDF ainda vai ao grupo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId, seeded } = await prepare(database)
        const summary = await summaryOf(database, companyId, seeded.occurrenceId)
        const { sender, sent } = fakeSender()

        await setReplyStatus(database, companyId, seeded.occurrenceId, 'overdue')
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toEqual([
          { body: GROUP_BOLETO_RETURN_TEXT.overdue(summary), kind: 'text', number: GROUP },
        ])

        await setReplyStatus(database, companyId, seeded.occurrenceId, 'needs_operator')
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })
        expect(sent.at(-1)).toEqual({
          body: GROUP_BOLETO_RETURN_TEXT.office(summary),
          kind: 'text',
          number: GROUP,
        })

        await database.db.execute(
          sql`update occurrence_contractor_replies set status = 'awaiting_contractor', reason = null
               where company_id = ${companyId}::uuid`,
        )
        await receivePdfReply(database, { companyId, conversationId })
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })
        expect(sent.at(-1)).toMatchObject({ kind: 'document', number: GROUP })
        expect(sent).toHaveLength(3)
        const state = await boletoReturnOf(database, requestId)
        expect(Object.keys((state?.notices ?? {}) as object).toSorted()).toEqual([
          'delivered',
          'office',
          'overdue',
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'Evolution fora: conta a tentativa, tenta de novo na próxima passada e desiste no teto',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId } = await prepare(database)
        await receivePdfReply(database, { companyId, conversationId })
        const failing = fakeSender('fail')
        for (let attempt = 1; attempt <= GROUP_BOLETO_RETURN_MAX_ATTEMPTS; attempt += 1) {
          expect(await pass(database, failing.sender, companyId)).toEqual({ failed: 1, sent: 0 })
        }
        expect(await boletoReturnOf(database, requestId)).toMatchObject({
          attempts: GROUP_BOLETO_RETURN_MAX_ATTEMPTS,
          status: 'failed',
        })
        const working = fakeSender()
        expect(await pass(database, working.sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(working.sent).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})

async function groupMessagesOf(database: TestDatabase, occurrenceId: string) {
  return (await database.db.execute(sql`
    select message.direction, message.automatic, message.sender_address, message.body_text
      from occurrence_conversation_messages message
      join occurrence_conversations conversation
        on conversation.company_id = message.company_id and conversation.id = message.conversation_id
     where conversation.occurrence_id = ${occurrenceId}::uuid and conversation.participant = 'driver'
       and message.channel = 'whatsapp'
     order by message.created_at, message.client_message_id`)) as unknown as readonly {
    automatic: boolean
    body_text: string
    direction: string
    sender_address: null | string
  }[]
}

describe('spec 292 T7: ajustes do teste em staging (04/11)', () => {
  testWithPostgres(
    'retorno que andou há mais de 30 min não vira aviso atrasado, mesmo com o retorno tocado agora',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId } = await prepare(database)
        await receivePdfReply(database, { companyId, conversationId })
        // O caso de 20:43: a entrega é velha; o `updated_at` recente (alarme, reenvio) não a faz nova.
        const later = new Date(Date.now() + 31 * 60_000)
        await database.db.execute(
          sql`update occurrence_contractor_replies set updated_at = ${later.toISOString()}::timestamptz,
                     last_alert_at = ${later.toISOString()}::timestamptz
               where company_id = ${companyId}::uuid`,
        )
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId, later)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a resposta de uma nota não leva junto o retorno já entregue antes do pedido (o caso das 20:43)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId } = await prepare(database)
        await receivePdfReply(database, { companyId, conversationId })
        // O pedido é mais novo que a entrega: o boleto que ele anuncia não é deste pedido.
        await database.db.execute(
          sql`update whatsapp_group_requests set opened_at = now() + interval '1 second'
               where id = ${requestId}::uuid`,
        )
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 0 })
        expect(sent).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois pedidos do grupo apontando para a mesma ocorrência: um aviso só, pelo mais novo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, requestId, seeded } = await prepare(database)
        const [linked] = await database.db
          .select({ actorUserId: tripFieldReports.actorUserId })
          .from(tripFieldReports)
          .where(eq(tripFieldReports.idempotencyKey, `whatsapp-group-request:${requestId}`))
        if (linked === undefined) throw new Error('EXPECTED_REPORT')
        const driverUserId = linked.actorUserId
        const [older] = await database.db
          .insert(whatsappGroupRequests)
          .values({
            closedAt: new Date(),
            companyId,
            driverId: seeded.company.firstDriverId,
            expiresAt: new Date(Date.now() + 600_000),
            groupJid: GROUP,
            openedAt: new Date(Date.now() - 60_000),
            ownerNumber: '5516991225783',
            state: { documentNumber: '899884' },
            status: 'completed',
            step: 'confirm',
            timeoutSeconds: 600,
          })
          .returning({ id: whatsappGroupRequests.id })
        if (older === undefined) throw new Error('EXPECTED_REQUEST')
        await database.db
          .update(whatsappGroupRequests)
          .set({ openedAt: new Date(Date.now() - 30_000) })
          .where(eq(whatsappGroupRequests.id, requestId))
        await database.db.insert(tripFieldReports).values({
          actorUserId: driverUserId,
          channel: 'whatsapp',
          companyId,
          idempotencyKey: `whatsapp-group-request:${older.id}`,
          operation: 'occurrence',
          resultId: seeded.occurrenceId,
        })
        await receivePdfReply(database, { companyId, conversationId })
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })
        expect(sent).toHaveLength(1)
        expect(await boletoReturnOf(database, requestId)).toMatchObject({ status: 'sent' })
        expect(await boletoReturnOf(database, older.id)).toBeUndefined()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'ocorrência resolvida na entrega: o aviso fecha com "Ocorrência concluída"',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, seeded } = await prepare(database)
        await receivePdfReply(database, { companyId, conversationId })
        const summary = await summaryOf(database, companyId, seeded.occurrenceId)
        await database.db.execute(sql`
          insert into trip_occurrence_resolution_events
            (company_id, document_occurrence_id, kind, actor_kind, contractor_reply_id)
          select company_id, occurrence_id, 'resolved', 'system', id
            from occurrence_contractor_replies where company_id = ${companyId}::uuid`)
        const { sender, sent } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })
        expect(sent).toEqual([
          {
            caption: GROUP_BOLETO_RETURN_TEXT.document(summary, true),
            kind: 'document',
            number: GROUP,
          },
        ])
        expect(GROUP_BOLETO_RETURN_TEXT.document(summary, true)).toContain('Ocorrência concluída')
        expect(seeded.occurrenceId).not.toBe('')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o diálogo do grupo e o aviso do retorno entram na conversa do motorista, canal WhatsApp, uma vez',
    async () => {
      await withConversationDatabase(async (database) => {
        const at = new Date().toISOString()
        const { companyId, conversationId, seeded } = await prepare(database, {
          transcript: [
            {
              at,
              from: 'member',
              name: 'Andrew',
              number: '5516991225783',
              text: 'prorrogar 899884',
            },
            { at, from: 'bot', text: 'Confirma? 1 - Sim 2 - Não' },
            { at, from: 'member', name: 'Andrew', number: '5516991225783', text: '1' },
            { at, from: 'bot', text: 'Ocorrência registrada!' },
          ],
        })
        expect(await syncWhatsAppGroupRequestTranscripts(database.db, { now: new Date() })).toBe(4)
        expect(await syncWhatsAppGroupRequestTranscripts(database.db, { now: new Date() })).toBe(0)

        await receivePdfReply(database, { companyId, conversationId })
        const summary = await summaryOf(database, companyId, seeded.occurrenceId)
        const { sender } = fakeSender()
        expect(await pass(database, sender, companyId)).toEqual({ failed: 0, sent: 1 })

        const messages = await groupMessagesOf(database, seeded.occurrenceId)
        expect(messages.map((message) => [message.direction, message.body_text])).toEqual([
          ['inbound', 'Andrew: prorrogar 899884'],
          ['outbound', 'Confirma? 1 - Sim 2 - Não'],
          ['inbound', 'Andrew: 1'],
          ['outbound', 'Ocorrência registrada!'],
          [
            'outbound',
            `${GROUP_BOLETO_RETURN_TEXT.document(summary)}\n\n(PDF do boleto enviado no grupo)`,
          ],
        ])
        expect(messages[0]?.sender_address).toBe('+5516991225783')
        expect(
          messages.filter((message) => message.direction === 'outbound').every((m) => m.automatic),
        ).toBe(true)
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('spec 292 T7: pedir boleto de novo lista só os pedidos do grupo que esperam a contratante', () => {
  testWithPostgres(
    'aguardando: a nota do pedido; entregue ou de outro grupo: nada; o reenvio sai em nome do motorista',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId, seeded } = await prepare(database)
        const resent: { actorUserId: string; occurrenceId: string }[] = []
        const ports = createGroupBoletoResendPorts({
          database: database.db,
          logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
          resend: async ({ actorUserId, occurrenceId }) => {
            resent.push({ actorUserId, occurrenceId })
          },
        })
        expect(await ports.listPending({ companyId, groupJid: GROUP })).toEqual([
          { documentNumber: '899884', occurrenceId: seeded.occurrenceId },
        ])
        expect(await ports.listPending({ companyId, groupJid: '120363000000000999@g.us' })).toEqual(
          [],
        )
        expect(
          await ports.resend({
            companyId,
            driverId: seeded.company.firstDriverId,
            idempotencyKey: 'k',
            occurrenceId: seeded.occurrenceId,
          }),
        ).toBe('sent')
        expect(resent).toHaveLength(1)

        await receivePdfReply(database, { companyId, conversationId })
        expect(await ports.listPending({ companyId, groupJid: GROUP })).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('spec 292 T7: o contato no grupo vai mascarado', () => {
  testWithPostgres('telefone, e-mail e número curto', () => {
    expect(maskGroupBoletoContact('+5516991225783')).toBe('(16) •••••-5783')
    expect(maskGroupBoletoContact('financeiro@mercado.example.test')).toBe(
      'fi•••@mercado.example.test',
    )
    expect(maskGroupBoletoContact('12')).toBe('•••')
  })
})
