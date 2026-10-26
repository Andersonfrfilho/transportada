/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3c (RF10), contra Postgres real: com o tipo em `client_email_send_mode = automatic`, o boleto aceito no modo
 * automático sai sozinho a todos os e-mails do tipo configurado no cadastro do cliente — um por endereço, gatilho
 * `automatic` e sem usuário (o Sistema), pelo trilho do envio manual. Idempotente por (retorno, anexo, endereço): o
 * botão depois não manda de novo ao mesmo endereço. Sem e-mail no cadastro, nada sai e fica `skipped /
 * client_without_email`, que a leitura do painel mostra. `manual`, tipo `off` e o modo com aprovação nunca enviam.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
  contractorMailOutbox,
  deliveryClientEmails,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { queueContractorReplyToClientEmails } from '../../src/occurrence-conversation/infrastructure/contractor-reply-client-email-forward.support.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import type {
  ClientEmailSendMode,
  ClientEmailType,
} from '../../src/shared/delivery-client-email.constant.js'
import {
  FORWARD_EMAIL_BODY,
  FORWARD_EMAIL_SUBJECT,
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '12345678000188'
const FINANCE_EMAIL = 'financeiro@mercado.example.test'
const OWNER_EMAIL = 'dono@mercado.example.test'
const INVOICE_EMAIL = 'nota@mercado.example.test'

type Scenario = {
  readonly clientEmailType?: ClientEmailType
  readonly emails?: readonly { readonly address: string; readonly purpose: 'boleto' | 'invoice' }[]
  readonly replyMode?: 'forward_after_approval' | 'forward_automatic'
  readonly sendMode?: ClientEmailSendMode
  readonly withClient?: boolean
}

const DEFAULT_EMAILS = [
  { address: FINANCE_EMAIL, purpose: 'boleto' },
  { address: OWNER_EMAIL, purpose: 'boleto' },
  { address: INVOICE_EMAIL, purpose: 'invoice' },
] as const

/** O destinatário da nota com cadastro de cliente e os e-mails dele, antes de o boleto chegar. */
async function seedClient(
  database: TestDatabase,
  seeded: Seeded,
  emails: NonNullable<Scenario['emails']>,
): Promise<Record<string, string>> {
  const { companyId, userId } = seeded.company
  const [document] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocumentOccurrences)
    .innerJoin(tripDocuments, eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId))
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (document?.nfeDocumentId === null || document?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: document.nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Mercado Beta',
    role: 'recipient',
    taxId: CLIENT_TAX_ID,
  })
  await database.db.insert(deliveryClients).values({
    companyId,
    displayName: 'Mercado Beta',
    taxId: CLIENT_TAX_ID,
  })
  if (emails.length === 0) return {}
  const rows = await database.db
    .insert(deliveryClientEmails)
    .values(
      emails.map((email) => ({
        ...email,
        companyId,
        createdByKind: 'office' as const,
        createdByUserId: userId,
        label: '',
        taxId: CLIENT_TAX_ID,
      })),
    )
    .returning({ address: deliveryClientEmails.address, id: deliveryClientEmails.id })
  return Object.fromEntries(rows.map((row) => [row.address, row.id]))
}

async function setClientEmailSettings(
  database: TestDatabase,
  seeded: Seeded,
  settings: {
    readonly clientEmailSendMode: ClientEmailSendMode
    readonly clientEmailType: ClientEmailType
  },
): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (occurrence?.typeId === null || occurrence?.typeId === undefined) {
    throw new Error('EXPECTED_OCCURRENCE_TYPE')
  }
  await database.db
    .update(companyOccurrenceTypes)
    .set(settings)
    .where(eq(companyOccurrenceTypes.id, occurrence.typeId))
}

async function receive(database: TestDatabase, scenario: Scenario = {}) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const emailIds =
    scenario.withClient === false
      ? {}
      : await seedClient(database, seeded, scenario.emails ?? DEFAULT_EMAILS)
  await setClientEmailSettings(database, seeded, {
    clientEmailSendMode: scenario.sendMode ?? 'automatic',
    clientEmailType: scenario.clientEmailType ?? 'boleto',
  })
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'off',
    note: 'off',
    replyMode: scenario.replyMode ?? 'forward_automatic',
  })
  const received = await receivePdfReply(database, { companyId, conversationId })
  return { ...received, companyId, emailIds, seeded }
}

function clientDeliveriesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      actorUserId: occurrenceContractorReplyDeliveries.actorUserId,
      address: occurrenceContractorReplyDeliveries.address,
      attachmentId: occurrenceContractorReplyDeliveries.attachmentId,
      mailMessageId: occurrenceContractorReplyDeliveries.mailMessageId,
      reason: occurrenceContractorReplyDeliveries.reason,
      status: occurrenceContractorReplyDeliveries.status,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

async function outboundMailsOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      bodyText: contractorMailMessages.bodyText,
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
    .where(
      and(
        eq(contractorMailMessages.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

async function replyIdOf(database: TestDatabase, companyId: string): Promise<string> {
  const [reply] = await database.db
    .select({ id: occurrenceContractorReplies.id })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  if (reply === undefined) throw new Error('EXPECTED_REPLY')
  return reply.id
}

describe('o boleto aceito sai sozinho aos e-mails do cliente (spec 279 RF10, T3c)', () => {
  testWithPostgres(
    'tipo automático: um e-mail por endereço do tipo configurado, pelo Sistema, com evento no outbox',
    async () => {
      await withConversationDatabase(async (database) => {
        const { attachmentId, companyId } = await receive(database)

        const deliveries = await clientDeliveriesOf(database, companyId)
        expect(deliveries.map((row) => row.address).toSorted()).toEqual([
          OWNER_EMAIL,
          FINANCE_EMAIL,
        ])
        for (const row of deliveries) {
          expect(row).toMatchObject({
            actorUserId: null,
            attachmentId,
            mailMessageId: expect.any(String),
            reason: null,
            status: 'queued',
            trigger: 'automatic',
          })
        }
        const mails = await outboundMailsOf(database, companyId)
        expect(mails.map((mail) => mail.toAddresses).toSorted()).toEqual([
          [OWNER_EMAIL],
          [FINANCE_EMAIL],
        ])
        for (const mail of mails) {
          expect(mail.subject).toBe(FORWARD_EMAIL_SUBJECT)
          expect(mail.bodyText).toContain(FORWARD_EMAIL_BODY)
          const outbox = await database.db
            .select({ eventType: contractorMailOutbox.eventType })
            .from(contractorMailOutbox)
            .where(eq(contractorMailOutbox.messageId, mail.id))
          expect(outbox).toEqual([{ eventType: 'message.send.requested' }])
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'repetir o automático e depois o botão para o mesmo endereço não manda de novo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, emailIds, seeded } = await receive(database)
        const replyId = await replyIdOf(database, companyId)

        const again = await database.db.transaction((transaction) =>
          queueContractorReplyToClientEmails(transaction, { companyId, replyId }),
        )
        expect(again).toEqual({
          alreadyQueued: 2,
          failed: 0,
          kind: 'processed',
          overLimit: 0,
          queued: 0,
        })

        const manual = await createForwardContractorReplyByEmailUseCase({
          unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
        }).forwardToClient({
          actorUserId: seeded.company.userId,
          authorKind: 'office',
          companyId,
          correlationId: `correlation-${crypto.randomUUID()}`,
          emailIds: [emailIds[FINANCE_EMAIL] ?? ''],
          idempotencyKey: `key-${crypto.randomUUID()}`,
          occurrenceId: seeded.occurrenceId,
          save: false,
        })
        expect(manual.results.map((result) => result.kind)).toEqual(['already_queued'])
        expect(await clientDeliveriesOf(database, companyId)).toHaveLength(2)
        expect(await outboundMailsOf(database, companyId)).toHaveLength(2)
      })
    },
    60_000,
  )

  testWithPostgres(
    'sem e-mail do tipo no cadastro (ou sem cadastro), nada sai e fica "skipped / client_without_email"',
    async () => {
      for (const scenario of [
        { emails: [{ address: INVOICE_EMAIL, purpose: 'invoice' as const }] },
        { withClient: false },
      ]) {
        await withConversationDatabase(async (database) => {
          const { companyId, seeded } = await receive(database, scenario)

          expect(await clientDeliveriesOf(database, companyId)).toEqual([
            {
              actorUserId: null,
              address: null,
              attachmentId: expect.any(String),
              mailMessageId: null,
              reason: 'client_without_email',
              status: 'skipped',
              trigger: 'automatic',
            },
          ])
          expect(await outboundMailsOf(database, companyId)).toEqual([])

          const replyId = await replyIdOf(database, companyId)
          const again = await database.db.transaction((transaction) =>
            queueContractorReplyToClientEmails(transaction, { companyId, replyId }),
          )
          expect(again).toEqual({ kind: 'skipped', reason: 'client_without_email' })
          expect(await clientDeliveriesOf(database, companyId)).toHaveLength(1)

          const options = await createDrizzleContractorReplyEmailReader(database.db).read({
            companyId,
            occurrenceId: seeded.occurrenceId,
          })
          expect(options).toMatchObject({
            clientEmailSendMode: 'automatic',
            deliveries: [
              {
                addressMasked: null,
                reason: 'client_without_email',
                status: 'skipped',
                target: 'client_boleto_emails',
              },
            ],
          })
        })
      }
    },
    120_000,
  )

  testWithPostgres(
    'manual, tipo "off" e o modo com aprovação do operador nunca enviam sozinhos',
    async () => {
      for (const scenario of [
        { sendMode: 'manual' as const },
        { clientEmailType: 'off' as const },
        { replyMode: 'forward_after_approval' as const },
      ]) {
        await withConversationDatabase(async (database) => {
          const { companyId } = await receive(database, scenario)

          expect(await clientDeliveriesOf(database, companyId)).toEqual([])
          expect(await outboundMailsOf(database, companyId)).toEqual([])
        })
      }
    },
    180_000,
  )

  testWithPostgres(
    'o teto de 5 e-mails por ocorrência vale: os primeiros do cadastro saem, o resto fica para o botão',
    async () => {
      await withConversationDatabase(async (database) => {
        const emails = Array.from({ length: 7 }, (_, index) => ({
          address: `pessoa${String(index)}@mercado.example.test`,
          purpose: 'boleto' as const,
        }))
        const { companyId } = await receive(database, { emails })

        const deliveries = await clientDeliveriesOf(database, companyId)
        expect(deliveries).toHaveLength(5)
        expect(deliveries.every((row) => row.status === 'queued')).toBe(true)
        const replyId = await replyIdOf(database, companyId)
        const again = await database.db.transaction((transaction) =>
          queueContractorReplyToClientEmails(transaction, { companyId, replyId }),
        )
        expect(again).toMatchObject({ alreadyQueued: 5, overLimit: 2, queued: 0 })
      })
    },
    60_000,
  )
})
