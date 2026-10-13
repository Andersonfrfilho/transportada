/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF6, contra Postgres real: "Reenviar o pedido à contratante". O e-mail sai na MESMA conversa e thread
 * do aviso automático, com a frase fixa e o pedido original; o evento do operador marca o reenvio; no máximo um
 * por intervalo do alarme — inclusive com dois pedidos de chaves diferentes ao mesmo tempo —; só enquanto o
 * retorno espera a contratante; repetir a chave devolve a resposta gravada; a empresa errada não alcança nada.
 */
import { describe, expect } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailMessages,
  contractorMailOutbox,
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  occurrenceConversationMessages,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createResendContractorReplyRequestUseCase } from '../../src/occurrence-conversation/application/resend-contractor-reply-request.use-case.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createDrizzleContractorReplyReader } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-read.repository.js'
import { createDrizzleContractorReplyResendReader } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-resend.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import type { ContractorReplyStatus } from '../../src/shared/occurrence-contractor-reply.constant.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const MINUTE = 60_000
/** O relógio do envio comum do fixture (o do aviso automático e do primeiro reenvio). */
const FIRST_SEND_AT = new Date('2026-09-24T18:00:00.000Z')
const LEAD_TEXT = 'Reenvio do pedido abaixo.'

async function openReply(database: TestDatabase, seeded: Seeded): Promise<void> {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyAlertIntervalMinutes: 60,
      contractorReplyMode: 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({
    companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
  })
}

function resendAt(database: TestDatabase, now: Date) {
  return createResendContractorReplyRequestUseCase({
    reader: createDrizzleContractorReplyResendReader(database.db),
    sendMail: createOccurrenceMailUseCase(database, undefined, now),
  })
}

function request(seeded: Seeded, idempotencyKey: string, companyId = seeded.company.companyId) {
  return {
    actorUserId: seeded.company.userId,
    companyId,
    correlationId: `correlation-${idempotencyKey}`,
    idempotencyKey,
    occurrenceId: seeded.occurrenceId,
  }
}

async function failureOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('EXPECTED_FAILURE')
}

async function resendEvents(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      actorKind: occurrenceContractorReplyEvents.actorKind,
      actorUserId: occurrenceContractorReplyEvents.actorUserId,
      fromStatus: occurrenceContractorReplyEvents.fromStatus,
      reason: occurrenceContractorReplyEvents.reason,
      toStatus: occurrenceContractorReplyEvents.toStatus,
    })
    .from(occurrenceContractorReplyEvents)
    .where(
      and(
        eq(occurrenceContractorReplyEvents.companyId, companyId),
        eq(occurrenceContractorReplyEvents.actorKind, 'user'),
      ),
    )
}

async function mailCount(database: TestDatabase, companyId: string): Promise<number> {
  const rows = await database.db
    .select({ id: contractorMailMessages.id })
    .from(contractorMailMessages)
    .where(eq(contractorMailMessages.companyId, companyId))
  return rows.length
}

async function setStatus(
  database: TestDatabase,
  seeded: Seeded,
  status: ContractorReplyStatus,
): Promise<void> {
  await database.db
    .update(occurrenceContractorReplies)
    .set({
      status,
      ...(status === 'handled'
        ? { handledByUserId: seeded.company.userId, handledNote: 'tratado por telefone' }
        : { handledByUserId: null, handledNote: null }),
    })
    .where(eq(occurrenceContractorReplies.companyId, seeded.company.companyId))
}

describe('reenviar o pedido à contratante contra Postgres (spec 248 RF6)', () => {
  testWithPostgres(
    'sai na mesma conversa e thread, com a frase fixa e o pedido original, só aos contatos do pedido',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId } = seeded.company
        await openReply(database, seeded)

        const result = await resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'resend-1'))
        expect(result.recipientCount).toBe(2)

        const messages = await database.db
          .select({
            automatic: occurrenceConversationMessages.automatic,
            authorUserId: occurrenceConversationMessages.authorUserId,
            bodyText: occurrenceConversationMessages.bodyText,
            conversationId: occurrenceConversationMessages.conversationId,
            mailMessageId: occurrenceConversationMessages.mailMessageId,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
          .orderBy(asc(occurrenceConversationMessages.createdAt))
        expect(messages).toHaveLength(2)
        const [original, resent] = messages
        expect(resent?.conversationId).toBe(original?.conversationId)
        expect(resent?.automatic).toBe(false)
        expect(resent?.authorUserId).toBe(userId)
        expect(resent?.bodyText).toBe(`${LEAD_TEXT}\n\n${original?.bodyText}`)

        const mails = await database.db
          .select({
            id: contractorMailMessages.id,
            subject: contractorMailMessages.subject,
            threadId: contractorMailMessages.threadId,
            toAddresses: contractorMailMessages.toAddresses,
          })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, companyId))
          .orderBy(asc(contractorMailMessages.createdAt))
        expect(mails).toHaveLength(2)
        expect(mails[1]?.threadId).toBe(mails[0]?.threadId)
        expect(mails[1]?.subject).toBe(mails[0]?.subject)
        expect([...(mails[1]?.toAddresses ?? [])].sort()).toEqual(
          ['compras@alfa.example.test', 'fiscal@alfa.example.test'].sort(),
        )
        const outbox = await database.db
          .select({ id: contractorMailOutbox.id })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.companyId, companyId))
        expect(outbox).toHaveLength(2)

        expect(await resendEvents(database, companyId)).toEqual([
          {
            actorKind: 'user',
            actorUserId: userId,
            fromStatus: 'awaiting_contractor',
            reason: null,
            toStatus: 'awaiting_contractor',
          },
        ])
      })
    },
  )

  testWithPostgres(
    'cedo demais é 409 e não grava nada; passado o intervalo sai de novo; o painel lê quando abre',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await openReply(database, seeded)
        const readerAt = (now: Date) =>
          createDrizzleContractorReplyReader(database.db, { clock: () => now })
        const find = { companyId, occurrenceId: seeded.occurrenceId }

        expect((await readerAt(FIRST_SEND_AT).findByOccurrence(find))?.resend).toEqual({
          availableAt: null,
          canResend: true,
          reason: null,
        })

        await resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'resend-1'))
        const mailsAfterFirst = await mailCount(database, companyId)

        const early = new Date(FIRST_SEND_AT.getTime() + 59 * MINUTE)
        expect(
          await failureOf(resendAt(database, early).resend(request(seeded, 'resend-2'))),
        ).toMatchObject({ code: 'CONTRACTOR_REPLY_RESEND_TOO_SOON', status: 409 })
        expect(await mailCount(database, companyId)).toBe(mailsAfterFirst)
        expect(await resendEvents(database, companyId)).toHaveLength(1)

        expect((await readerAt(early).findByOccurrence(find))?.resend).toEqual({
          availableAt: new Date(FIRST_SEND_AT.getTime() + 60 * MINUTE),
          canResend: false,
          reason: 'too_soon',
        })

        const late = new Date(FIRST_SEND_AT.getTime() + 60 * MINUTE)
        expect((await readerAt(late).findByOccurrence(find))?.resend.canResend).toBe(true)
        await resendAt(database, late).resend(request(seeded, 'resend-3'))
        expect(await mailCount(database, companyId)).toBe(mailsAfterFirst + 1)
        expect(await resendEvents(database, companyId)).toHaveLength(2)
      })
    },
  )

  testWithPostgres('atrasada também reenvia; o evento fica atrasado → atrasado', async () => {
    await withConversationDatabase(async (database) => {
      const seeded = await seedMailScenario(database)
      const { companyId } = seeded.company
      await openReply(database, seeded)
      await setStatus(database, seeded, 'overdue')

      await resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'resend-overdue'))

      expect(await resendEvents(database, companyId)).toMatchObject([
        { fromStatus: 'overdue', toStatus: 'overdue' },
      ])
    })
  })

  testWithPostgres(
    'repetir a chave devolve a resposta gravada: um e-mail, um evento, mesmo depois do intervalo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await openReply(database, seeded)

        const first = await resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'resend-1'))
        const mailsAfterFirst = await mailCount(database, companyId)
        const retried = await resendAt(
          database,
          new Date(FIRST_SEND_AT.getTime() + 5 * MINUTE),
        ).resend(request(seeded, 'resend-1'))

        expect(retried).toEqual(first)
        expect(await mailCount(database, companyId)).toBe(mailsAfterFirst)
        expect(await resendEvents(database, companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'dois pedidos de chaves diferentes ao mesmo tempo: um sai, o outro é 409 (a trava do retorno)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await openReply(database, seeded)
        const mailsBefore = await mailCount(database, companyId)

        const outcomes = await Promise.allSettled([
          resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'race-a')),
          resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'race-b')),
        ])

        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
        const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
        expect(rejected?.status === 'rejected' ? rejected.reason : null).toMatchObject({
          code: 'CONTRACTOR_REPLY_RESEND_TOO_SOON',
        })
        expect(await mailCount(database, companyId)).toBe(mailsBefore + 1)
        expect(await resendEvents(database, companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'retorno que não espera mais a contratante é 409, com o botão desligado na leitura',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await openReply(database, seeded)
        const mailsBefore = await mailCount(database, companyId)

        for (const status of [
          'reply_received',
          'awaiting_operator',
          'needs_operator',
          'delivered',
          'handled',
          'cancelled',
        ] as const) {
          await setStatus(database, seeded, status)
          expect(
            await failureOf(
              resendAt(database, FIRST_SEND_AT).resend(request(seeded, `k-${status}`)),
            ),
          ).toMatchObject({ code: 'CONTRACTOR_REPLY_NOT_RESENDABLE', status: 409 })

          const view = await createDrizzleContractorReplyReader(database.db).findByOccurrence({
            companyId,
            occurrenceId: seeded.occurrenceId,
          })
          expect(view?.resend).toEqual({
            availableAt: null,
            canResend: false,
            reason: 'not_waiting',
          })
        }
        expect(await mailCount(database, companyId)).toBe(mailsBefore)
        expect(await resendEvents(database, companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'ocorrência sem retorno e empresa errada respondem igual (409), sem enviar nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const reader = createDrizzleContractorReplyResendReader(database.db)

        expect(
          await reader.findContext({ companyId, occurrenceId: seeded.occurrenceId }),
        ).toBeNull()
        expect(
          await failureOf(resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'no-reply'))),
        ).toMatchObject({ code: 'CONTRACTOR_REPLY_NOT_RESENDABLE' })

        await openReply(database, seeded)
        const other = crypto.randomUUID()
        expect(
          await reader.findContext({ companyId: other, occurrenceId: seeded.occurrenceId }),
        ).toBeNull()
        expect(
          await failureOf(
            resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'other-company', other)),
          ),
        ).toMatchObject({ code: 'CONTRACTOR_REPLY_NOT_RESENDABLE' })
        expect(await resendEvents(database, companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'os destinatários são os contatos do pedido; sem nenhum ativo é 422 e o evento é desfeito junto',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await openReply(database, seeded)
        const reader = createDrizzleContractorReplyResendReader(database.db)

        const context = await reader.findContext({ companyId, occurrenceId: seeded.occurrenceId })
        expect(context?.original?.toAddresses).toHaveLength(2)
        expect(context?.contactIds).toHaveLength(2)
        // Os dois primeiros contatos do cenário são os que receberam o aviso; o terceiro não recebe ocorrência.
        expect(seeded.contactIds.slice(0, 2).sort()).toEqual(
          [...(context?.contactIds ?? [])].sort(),
        )

        await database.db
          .update(contractorContacts)
          .set({ status: 'inactive' })
          .where(eq(contractorContacts.companyId, companyId))
        const mailsBefore = await mailCount(database, companyId)
        expect(
          await failureOf(resendAt(database, FIRST_SEND_AT).resend(request(seeded, 'no-contact'))),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_NO_RECIPIENT', status: 422 })
        expect(await mailCount(database, companyId)).toBe(mailsBefore)
        expect(await resendEvents(database, companyId)).toEqual([])
      })
    },
  )
})
