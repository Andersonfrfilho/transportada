/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7/T4.8 (CA07), contra Postgres real: o boleto da contratante por e-mail ao cliente da nota ou a um
 * endereço informado. A entrega e a mensagem da 143 nascem na mesma transação, presas à thread da ocorrência mas
 * sem mensagem de conversa; repetir a chave não duplica; o sexto envio é recusado; nota sem e-mail vira
 * `skipped` e não manda a lugar nenhum; empresa B não alcança o retorno da A.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailThreads,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import {
  ContractorReplyEmailForwardDisabledError,
  ContractorReplyEmailLimitReachedError,
} from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
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
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const NOTE_EMAIL = 'cliente@destino.example.test'
const INFORMED_EMAIL = 'financeiro@terceiro.example.test'
const BOTH_MANUAL: ForwardModes = { informed: 'manual', note: 'manual' }

async function prepare(database: TestDatabase, forward: ForwardModes = BOTH_MANUAL) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, forward)
  const received = await receivePdfReply(database, { companyId, conversationId })
  const useCase = createForwardContractorReplyByEmailUseCase({
    unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
  })
  return { ...received, companyId, seeded, useCase }
}

function inputOf(
  seeded: Seeded,
  overrides: Partial<
    Parameters<ReturnType<typeof createForwardContractorReplyByEmailUseCase>['forward']>[0]
  > = {},
) {
  return {
    actorUserId: seeded.company.userId,
    companyId: seeded.company.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    idempotencyKey: `key-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    target: 'note_recipient_email' as const,
    ...overrides,
  }
}

function deliveriesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      address: occurrenceContractorReplyDeliveries.address,
      attachmentId: occurrenceContractorReplyDeliveries.attachmentId,
      mailMessageId: occurrenceContractorReplyDeliveries.mailMessageId,
      reason: occurrenceContractorReplyDeliveries.reason,
      status: occurrenceContractorReplyDeliveries.status,
      target: occurrenceContractorReplyDeliveries.target,
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

function forwardedMailsOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      bodyText: contractorMailMessages.bodyText,
      ccAddresses: contractorMailMessages.ccAddresses,
      deliveryStatus: contractorMailMessages.deliveryStatus,
      direction: contractorMailMessages.direction,
      id: contractorMailMessages.id,
      subject: contractorMailMessages.subject,
      threadId: contractorMailMessages.threadId,
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

describe('o boleto por e-mail ao cliente da nota (spec 248 T4.7, RF10, CA07)', () => {
  testWithPostgres(
    'grava a entrega, a mensagem da 143 presa à thread e o evento do outbox, sem mensagem de conversa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { attachmentId, companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        const conversationMessagesBefore = await database.db
          .select({ id: occurrenceConversationMessages.id })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))

        const outcome = await useCase.forward(inputOf(seeded))

        expect(outcome.kind).toBe('queued')
        expect(JSON.stringify(outcome)).not.toContain(NOTE_EMAIL)
        const [delivery] = await deliveriesOf(database, companyId)
        expect(delivery).toMatchObject({
          address: NOTE_EMAIL,
          attachmentId,
          reason: null,
          status: 'queued',
          target: 'note_recipient_email',
          trigger: 'operator',
        })
        const [mail] = await forwardedMailsOf(database, companyId)
        expect(mail).toMatchObject({
          deliveryStatus: 'queued',
          direction: 'outbound',
          /** Spec 267 RF6: o encaminhamento a terceiro nunca leva a cópia dos responsáveis. */
          ccAddresses: [],
          subject: FORWARD_EMAIL_SUBJECT,
          toAddresses: [NOTE_EMAIL],
        })
        expect(mail?.bodyText).toContain(FORWARD_EMAIL_BODY)
        expect(delivery?.mailMessageId).toBe(mail?.id)
        const [thread] = await database.db
          .select({ id: contractorMailThreads.id })
          .from(contractorMailThreads)
          .where(
            and(
              eq(contractorMailThreads.companyId, companyId),
              eq(contractorMailThreads.subjectId, seeded.occurrenceId),
            ),
          )
        expect(mail?.threadId).toBe(thread?.id)
        const outbox = await database.db
          .select({ messageId: contractorMailOutbox.messageId })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.messageId, mail?.id ?? ''))
        expect(outbox).toHaveLength(1)
        const conversationMessagesAfter = await database.db
          .select({ id: occurrenceConversationMessages.id })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
        expect(conversationMessagesAfter).toHaveLength(conversationMessagesBefore.length)
      })
    },
    60_000,
  )

  testWithPostgres(
    'repetir a mesma Idempotency-Key não duplica; chave nova é outro envio; o sexto é recusado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        const first = inputOf(seeded, { idempotencyKey: 'key-fixa' })

        expect((await useCase.forward(first)).kind).toBe('queued')
        expect((await useCase.forward(first)).kind).toBe('already_queued')
        expect(await forwardedMailsOf(database, companyId)).toHaveLength(1)

        for (let sent = 2; sent <= 5; sent += 1) {
          expect((await useCase.forward(inputOf(seeded))).kind).toBe('queued')
        }
        expect(await forwardedMailsOf(database, companyId)).toHaveLength(5)
        await expect(useCase.forward(inputOf(seeded))).rejects.toBeInstanceOf(
          ContractorReplyEmailLimitReachedError,
        )
        expect(await forwardedMailsOf(database, companyId)).toHaveLength(5)
      })
    },
    90_000,
  )

  testWithPostgres(
    'nota sem e-mail: skipped, nada na fila e nenhum outro endereço',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, null)

        const outcome = await useCase.forward(inputOf(seeded))

        expect(outcome).toMatchObject({ kind: 'skipped', reason: 'note_without_recipient_email' })
        expect(await forwardedMailsOf(database, companyId)).toEqual([])
        expect(await deliveriesOf(database, companyId)).toMatchObject([
          {
            address: null,
            mailMessageId: null,
            reason: 'note_without_recipient_email',
            status: 'skipped',
          },
        ])
        const options = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(options?.noteRecipient).toEqual({ addressMasked: null, isAvailable: false })
      })
    },
    60_000,
  )

  testWithPostgres(
    'PDF acima de 10 MB: failed com o motivo e nada na fila',
    async () => {
      await withConversationDatabase(async (database) => {
        const { attachmentId, companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        await database.db
          .update(occurrenceConversationAttachments)
          .set({ sizeBytes: 10 * 1024 * 1024 + 1 })
          .where(eq(occurrenceConversationAttachments.id, attachmentId))

        expect(await useCase.forward(inputOf(seeded))).toMatchObject({
          kind: 'failed',
          reason: 'attachment_too_large_for_email',
        })
        expect(await forwardedMailsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'a leitura das opções traz o estado e só o endereço mascarado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        await useCase.forward(inputOf(seeded))

        const options = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })

        expect(options).toMatchObject({
          forwardToInformedEmail: 'manual',
          forwardToNoteRecipient: 'manual',
          noteRecipient: { addressMasked: 'c***@d***.example.test', isAvailable: true },
          sentCount: 1,
          sentLimit: 5,
        })
        expect(options?.deliveries).toHaveLength(1)
        expect(JSON.stringify(options)).not.toContain(NOTE_EMAIL)
      })
    },
    60_000,
  )
})

describe('o boleto por e-mail a um endereço informado (spec 248 T4.7, RF11)', () => {
  testWithPostgres(
    'manda ao endereço informado, e o alvo desligado na cópia do retorno é recusado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        const outcome = await useCase.forward(
          inputOf(seeded, { address: INFORMED_EMAIL, target: 'informed_email' }),
        )
        expect(outcome.kind).toBe('queued')
        expect(
          (await forwardedMailsOf(database, companyId)).map((mail) => mail.toAddresses),
        ).toEqual([[INFORMED_EMAIL]])
      })

      await withConversationDatabase(async (database) => {
        const { seeded, useCase } = await prepare(database, { informed: 'off', note: 'manual' })
        await expect(
          useCase.forward(inputOf(seeded, { address: INFORMED_EMAIL, target: 'informed_email' })),
        ).rejects.toBeInstanceOf(ContractorReplyEmailForwardDisabledError)
      })
    },
    90_000,
  )
})

describe('isolamento entre empresas (spec 248 CA09)', () => {
  testWithPostgres(
    'a empresa B não alcança o retorno da A: 404 e nada gravado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        await setNoteRecipientEmail(database, companyId, NOTE_EMAIL)
        const other = await seedCompany(database)

        await expect(
          useCase.forward({
            ...inputOf(seeded),
            actorUserId: other.userId,
            companyId: other.companyId,
          }),
        ).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
        expect(await forwardedMailsOf(database, companyId)).toEqual([])
        expect(
          await createDrizzleContractorReplyEmailReader(database.db).read({
            companyId: other.companyId,
            occurrenceId: seeded.occurrenceId,
          }),
        ).toBeNull()
      })
    },
    60_000,
  )
})
