/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF10 (T4.7), contra Postgres real: a resposta da contratante aceita no modo automático, com o tipo em
 * `forward_to_note_recipient = automatic`, enfileira sozinha o e-mail ao cliente da nota — pelo mesmo trilho do
 * envio manual (mensagem da 143 presa à thread, sem token, evento no outbox, linha em
 * `occurrence_contractor_reply_deliveries`). Idempotente; nunca no modo com aprovação; sem e-mail válido na nota
 * é `skipped`; falha do envio não desfaz o retorno recebido.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailOutbox,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
} from '../../src/database/database.schema.js'
import { queueContractorReplyToNoteRecipient } from '../../src/occurrence-conversation/infrastructure/contractor-reply-note-recipient-forward.support.js'
import {
  FORWARD_EMAIL_BODY,
  FORWARD_EMAIL_SUBJECT,
  openReplyWithForward,
  receivePdfReply,
  setNoteRecipientEmail,
} from '../fixtures/contractor-reply-database.fixture.js'
import type { ForwardModes } from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const NOTE_EMAIL = 'cliente@destino.example.test'
const AUTOMATIC: ForwardModes = {
  informed: 'off',
  note: 'automatic',
  replyMode: 'forward_automatic',
}

async function receive(
  database: TestDatabase,
  options: {
    readonly forward: ForwardModes
    readonly noteEmail: null | string
    readonly sizeBytes?: number
  },
) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  await setNoteRecipientEmail(database, companyId, options.noteEmail)
  const conversationId = await openReplyWithForward(database, seeded, options.forward)
  const received = await receivePdfReply(database, {
    companyId,
    conversationId,
    ...(options.sizeBytes === undefined ? {} : { sizeBytes: options.sizeBytes }),
  })
  return { ...received, companyId }
}

function deliveriesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      actorUserId: occurrenceContractorReplyDeliveries.actorUserId,
      address: occurrenceContractorReplyDeliveries.address,
      attachmentId: occurrenceContractorReplyDeliveries.attachmentId,
      mailMessageId: occurrenceContractorReplyDeliveries.mailMessageId,
      reason: occurrenceContractorReplyDeliveries.reason,
      replyId: occurrenceContractorReplyDeliveries.replyId,
      status: occurrenceContractorReplyDeliveries.status,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'note_recipient_email'),
      ),
    )
}

async function replyOf(database: TestDatabase, companyId: string) {
  const [reply] = await database.db
    .select({
      id: occurrenceContractorReplies.id,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  if (reply === undefined) throw new Error('EXPECTED_REPLY')
  return reply
}

async function outboundMailsOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      bodyHtml: contractorMailMessages.bodyHtml,
      bodyText: contractorMailMessages.bodyText,
      deliveryStatus: contractorMailMessages.deliveryStatus,
      id: contractorMailMessages.id,
      subject: contractorMailMessages.subject,
      toAddresses: contractorMailMessages.toAddresses,
    })
    .from(contractorMailMessages)
    .innerJoin(
      occurrenceContractorReplyDeliveries,
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, contractorMailMessages.companyId),
        eq(occurrenceContractorReplyDeliveries.mailMessageId, contractorMailMessages.id),
      ),
    )
    .where(eq(contractorMailMessages.companyId, companyId))
}

describe('o boleto sai sozinho ao cliente da nota (spec 248 RF10, T4.7)', () => {
  testWithPostgres(
    'modo automático com tipo automático: enfileira o e-mail pelo trilho do manual, sem token',
    async () => {
      await withConversationDatabase(async (database) => {
        const { attachmentId, companyId } = await receive(database, {
          forward: AUTOMATIC,
          noteEmail: NOTE_EMAIL,
        })

        const reply = await replyOf(database, companyId)
        expect(await deliveriesOf(database, companyId)).toEqual([
          {
            actorUserId: null,
            address: NOTE_EMAIL,
            attachmentId,
            mailMessageId: expect.any(String),
            reason: null,
            replyId: reply.id,
            status: 'queued',
            trigger: 'automatic',
          },
        ])
        const [mail] = await outboundMailsOf(database, companyId)
        expect(mail).toMatchObject({
          bodyText: expect.stringContaining(FORWARD_EMAIL_BODY),
          deliveryStatus: 'queued',
          subject: FORWARD_EMAIL_SUBJECT,
          toAddresses: [NOTE_EMAIL],
        })
        expect(mail?.bodyHtml).toContain(`<p>${FORWARD_EMAIL_BODY}</p>`)
        const outbox = await database.db
          .select({ eventType: contractorMailOutbox.eventType })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.messageId, mail?.id ?? ''))
        expect(outbox).toEqual([{ eventType: 'message.send.requested' }])
      })
    },
    60_000,
  )

  testWithPostgres(
    'repetir o enfileiramento do mesmo retorno e anexo não duplica a entrega nem o e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await receive(database, { forward: AUTOMATIC, noteEmail: NOTE_EMAIL })
        const reply = await replyOf(database, companyId)

        const second = await database.db.transaction((transaction) =>
          queueContractorReplyToNoteRecipient(transaction, { companyId, replyId: reply.id }),
        )

        expect(second).toEqual({ kind: 'already_queued' })
        expect(await deliveriesOf(database, companyId)).toHaveLength(1)
        expect(await outboundMailsOf(database, companyId)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'modo com aprovação do operador nunca envia sozinho, mesmo com o tipo em automático',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await receive(database, {
          forward: { ...AUTOMATIC, replyMode: 'forward_after_approval' },
          noteEmail: NOTE_EMAIL,
        })

        expect((await replyOf(database, companyId)).status).toBe('awaiting_operator')
        expect(await deliveriesOf(database, companyId)).toEqual([])
        expect(await outboundMailsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'tipo em manual ou desligado não envia sozinho no modo automático',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await receive(database, {
          forward: { informed: 'off', note: 'manual', replyMode: 'forward_automatic' },
          noteEmail: NOTE_EMAIL,
        })

        expect(await deliveriesOf(database, companyId)).toEqual([])
        expect(await outboundMailsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'nota sem e-mail, ou com endereço que não é um endereço, vira skipped e não manda a lugar nenhum',
    async () => {
      for (const noteEmail of [null, 'a@b.c', 'Nome<x@y.example.test>']) {
        await withConversationDatabase(async (database) => {
          const { companyId } = await receive(database, { forward: AUTOMATIC, noteEmail })

          expect(await deliveriesOf(database, companyId)).toMatchObject([
            {
              address: null,
              mailMessageId: null,
              reason: 'note_without_recipient_email',
              status: 'skipped',
              trigger: 'automatic',
            },
          ])
          expect(await outboundMailsOf(database, companyId)).toEqual([])
        })
      }
    },
    120_000,
  )

  testWithPostgres(
    'PDF acima de 10 MB vira failed / attachment_too_large_for_email, sem e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await receive(database, {
          forward: AUTOMATIC,
          noteEmail: NOTE_EMAIL,
          sizeBytes: 11 * 1024 * 1024,
        })

        expect(await deliveriesOf(database, companyId)).toMatchObject([
          { reason: 'attachment_too_large_for_email', status: 'failed' },
        ])
        expect(await outboundMailsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'falha ao enfileirar o e-mail não desfaz o retorno: fica failed / send_failed e nenhuma mensagem sobra',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        const conversationId = await openReplyWithForward(database, seeded, AUTOMATIC)
        // Depois de abrir o retorno (que também grava no outbox): só o envio ao cliente da nota enfrenta a falha.
        await database.db.execute(sql`
          create function fail_mail_outbox() returns trigger language plpgsql as
          $$ begin raise exception 'outbox_unavailable'; end $$`)
        await database.db.execute(sql`
          create trigger fail_mail_outbox before insert on contractor_mail_outbox
          for each row execute function fail_mail_outbox()`)
        const received = await receivePdfReply(database, { companyId, conversationId })

        expect(received.attachmentId).not.toBe('')
        expect(['reply_received', 'delivered']).toContain(
          (await replyOf(database, companyId)).status,
        )
        expect(await deliveriesOf(database, companyId)).toMatchObject([
          { address: null, reason: 'send_failed', status: 'failed', trigger: 'automatic' },
        ])
        expect(await outboundMailsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )
})
