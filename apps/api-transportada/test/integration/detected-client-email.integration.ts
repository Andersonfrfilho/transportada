/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4b (RF8/RF10b), contra Postgres real: o motorista escreve um e-mail na conversa da ocorrência depois do
 * boleto aceito. No `manual` a mensagem só ganha `detected_email` (nada sai) e o cartão aparece ao motorista e ao
 * operador, que enviam pelo `messageId` (com `save` para guardar); no WhatsApp o "1" confirma. No `automatic` o boleto
 * sai na hora, sem cartão e sem guardar. Sem boleto aceito ou com o tipo `off`, nada é marcado. Resposta e cartão só
 * levam a forma mascarada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  deliveryClientEmails,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createDriverClientBoletoEmailsUseCase } from '../../src/occurrence-conversation/application/driver-client-boleto-emails.use-case.js'
import { createReplyMyOccurrenceConversationUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { createDetectedClientEmail } from '../../src/occurrence-conversation/infrastructure/detected-client-email.factory.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import type {
  ClientEmailSendMode,
  ClientEmailType,
} from '../../src/shared/delivery-client-email.constant.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '12345678000188'
const TYPED_EMAIL = 'Fulano@Mercado.example.test'
const SECOND_EMAIL = 'dono@mercado.example.test'
const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }
const FINGERPRINT = {
  create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
    fields.map((field) => new TextDecoder().decode(field)).join('|'),
}

async function seedClient(database: TestDatabase, seeded: Seeded): Promise<void> {
  const { companyId } = seeded.company
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
}

async function setType(
  database: TestDatabase,
  seeded: Seeded,
  values: { clientEmailSendMode?: ClientEmailSendMode; clientEmailType?: ClientEmailType },
): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set(values)
    .where(eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''))
}

async function prepare(
  database: TestDatabase,
  options: { readonly boletoAccepted?: boolean; readonly sendMode?: ClientEmailSendMode } = {},
) {
  const seeded = await seedMailScenario(database)
  const { companyId, firstDriverId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  if (options.boletoAccepted !== false)
    await receivePdfReply(database, { companyId, conversationId })
  await seedClient(database, seeded)
  await setType(database, seeded, {
    clientEmailSendMode: options.sendMode ?? 'manual',
    clientEmailType: 'boleto',
  })
  const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
  const detection = createDetectedClientEmail(database.db, SILENT_LOGGER)
  const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
  const reply = createReplyMyOccurrenceConversationUseCase({
    clock: () => new Date(),
    detectedClientEmail: detection,
    fingerprintService: FINGERPRINT,
    storage: UNUSED_ATTACHMENT_STORAGE,
    unitOfWork,
  })
  const driverEmails = createDriverClientBoletoEmailsUseCase({
    detectedClientEmail: detection,
    emailOptions: createDrizzleContractorReplyEmailReader(database.db),
    forwardByEmail: createForwardContractorReplyByEmailUseCase({
      unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
    }),
    unitOfWork,
  })
  const scope = {
    companyId,
    driverId: firstDriverId,
    driverUserId,
    occurrenceId: seeded.occurrenceId,
  }
  const write = (bodyText: string) =>
    reply.reply({ ...scope, bodyText, idempotencyKey: `reply-${crypto.randomUUID()}` })
  return { companyId, detection, driverEmails, scope, seeded, write }
}

async function readMessage(database: TestDatabase, messageId: string) {
  const [row] = await database.db
    .select({
      detectedEmail: occurrenceConversationMessages.detectedEmail,
      sentAt: occurrenceConversationMessages.detectedEmailSentAt,
    })
    .from(occurrenceConversationMessages)
    .where(eq(occurrenceConversationMessages.id, messageId))
  return row
}

async function clientDeliveries(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      address: occurrenceContractorReplyDeliveries.address,
      status: occurrenceContractorReplyDeliveries.status,
    })
    .from(occurrenceContractorReplyDeliveries)
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

async function savedAddresses(database: TestDatabase, companyId: string) {
  return database.db
    .select({ address: deliveryClientEmails.address, kind: deliveryClientEmails.createdByKind })
    .from(deliveryClientEmails)
    .where(eq(deliveryClientEmails.companyId, companyId))
}

describe('o e-mail escrito pelo motorista na conversa (spec 279 T4b, RF8)', () => {
  testWithPostgres(
    'manual: reconhece sem enviar; o cartão mascarado envia, guarda com save e some depois',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, detection, driverEmails, scope, write } = await prepare(database)

        const plain = await write('Bom dia, chegando no cliente.')
        expect((await readMessage(database, plain.messageId))?.detectedEmail).toBeNull()
        expect(await driverEmails.detected(scope)).toBeNull()

        const typed = await write(`o cliente pediu, manda pra ${TYPED_EMAIL}.`)
        expect(await readMessage(database, typed.messageId)).toEqual({
          detectedEmail: TYPED_EMAIL,
          sentAt: null,
        })
        expect(await clientDeliveries(database, companyId)).toEqual([])

        const card = await driverEmails.detected(scope)
        expect(card).toEqual({
          addressMasked: 'F***@M***.example.test',
          createdAt: expect.any(String),
          messageId: typed.messageId,
        })
        expect(JSON.stringify(card)).not.toContain(TYPED_EMAIL)
        expect(
          await detection.readPending({ companyId, occurrenceId: scope.occurrenceId }),
        ).toEqual(card)

        const sent = await driverEmails.sendDetected({
          ...scope,
          correlationId: `correlation-${crypto.randomUUID()}`,
          idempotencyKey: `key-${crypto.randomUUID()}`,
          messageId: typed.messageId,
          save: true,
        })
        expect(sent.results).toMatchObject([
          { addressMasked: 'F***@M***.example.test', kind: 'queued' },
        ])
        expect(sent.savedEmailId).not.toBeNull()
        expect(JSON.stringify(sent)).not.toContain(TYPED_EMAIL)
        expect(await savedAddresses(database, companyId)).toEqual([
          { address: TYPED_EMAIL, kind: 'driver' },
        ])
        expect((await readMessage(database, typed.messageId))?.sentAt).toBeInstanceOf(Date)
        expect(await driverEmails.detected(scope)).toBeNull()

        /** O operador repete pelo painel: o trilho reconhece o mesmo endereço e não manda de novo. */
        const again = await detection.send({
          actorUserId: scope.driverUserId,
          authorKind: 'office',
          companyId,
          correlationId: `correlation-${crypto.randomUUID()}`,
          idempotencyKey: `key-${crypto.randomUUID()}`,
          messageId: typed.messageId,
          occurrenceId: scope.occurrenceId,
          save: false,
        })
        expect(again.results).toMatchObject([{ kind: 'already_queued' }])
        expect(await clientDeliveries(database, companyId)).toHaveLength(1)

        const unknown = await detection
          .send({
            actorUserId: scope.driverUserId,
            authorKind: 'office',
            companyId,
            correlationId: 'correlation-unknown',
            idempotencyKey: 'key-unknown',
            messageId: plain.messageId,
            occurrenceId: scope.occurrenceId,
            save: false,
          })
          .catch((error: unknown) => error)
        expect(unknown).toMatchObject({ code: 'DETECTED_CLIENT_EMAIL_NOT_FOUND' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'WhatsApp: o aviso pede "1", fica na conversa com o id da Meta, e o "1" leva o boleto',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, detection, scope, write } = await prepare(database)
        const typed = await write(`manda pra ${TYPED_EMAIL}`)
        const [stored] = await database.db
          .select({ conversationId: occurrenceConversationMessages.conversationId })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, typed.messageId))
        const conversationId = stored?.conversationId ?? ''
        const sentTexts: string[] = []
        const whatsapp = {
          kind: 'whatsapp' as const,
          send: async (body: string) => {
            sentTexts.push(body)
            return { externalMessageId: `wamid.${crypto.randomUUID()}` }
          },
        }
        const [confirmation] = await database.db
          .insert(occurrenceConversationMessages)
          .values({
            bodyText: '1',
            channel: 'whatsapp',
            companyId,
            conversationId,
            direction: 'inbound',
            driverUserId: scope.driverUserId,
            providerMessageId: `wamid.${crypto.randomUUID()}`,
          })
          .returning({ id: occurrenceConversationMessages.id })

        const outcome = await detection.onDriverMessage({
          bodyText: '1',
          channel: whatsapp,
          companyId,
          conversationId,
          correlationId: 'correlation-whatsapp',
          driverUserId: scope.driverUserId,
          messageId: confirmation?.id ?? '',
        })
        expect(outcome).toEqual({ addressMasked: 'F***@M***.example.test', kind: 'sent' })
        expect(sentTexts).toEqual(['Boleto enviado para F***@M***.example.test.'])
        expect(await clientDeliveries(database, companyId)).toEqual([
          { address: TYPED_EMAIL, status: 'queued' },
        ])
        expect((await readMessage(database, typed.messageId))?.sentAt).toBeInstanceOf(Date)
        expect(await savedAddresses(database, companyId)).toEqual([])

        const prompts = await database.db
          .select({
            automatic: occurrenceConversationMessages.automatic,
            bodyText: occurrenceConversationMessages.bodyText,
            channel: occurrenceConversationMessages.channel,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.conversationId, conversationId),
              eq(occurrenceConversationMessages.direction, 'outbound'),
            ),
          )
        expect(prompts).toEqual([
          {
            automatic: true,
            bodyText: 'Boleto enviado para F***@M***.example.test.',
            channel: 'whatsapp',
          },
        ])

        /** Sem e-mail pendente, o "1" não faz nada. */
        expect(
          await detection.onDriverMessage({
            bodyText: '1',
            channel: whatsapp,
            companyId,
            conversationId,
            correlationId: 'correlation-whatsapp-2',
            driverUserId: scope.driverUserId,
            messageId: confirmation?.id ?? '',
          }),
        ).toEqual({ kind: 'none' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'automático: sai na hora ao primeiro endereço, sem cartão e sem guardar no cadastro',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, driverEmails, scope, write } = await prepare(database, {
          sendMode: 'automatic',
        })
        const typed = await write(`email ${TYPED_EMAIL} e copia ${SECOND_EMAIL}`)
        expect(await readMessage(database, typed.messageId)).toEqual({
          detectedEmail: TYPED_EMAIL,
          sentAt: expect.any(Date),
        })
        expect(await clientDeliveries(database, companyId)).toEqual([
          { address: TYPED_EMAIL, status: 'queued' },
        ])
        expect(await driverEmails.detected(scope)).toBeNull()
        expect(await savedAddresses(database, companyId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'sem boleto aceito ou com o tipo off, o e-mail da conversa não é marcado',
    async () => {
      await withConversationDatabase(async (database) => {
        const before = await prepare(database, { boletoAccepted: false })
        const early = await before.write(`manda pra ${TYPED_EMAIL}`)
        expect((await readMessage(database, early.messageId))?.detectedEmail).toBeNull()
      })
      await withConversationDatabase(async (database) => {
        const { seeded, write } = await prepare(database)
        await setType(database, seeded, { clientEmailType: 'off' })
        const off = await write(`manda pra ${TYPED_EMAIL}`)
        expect((await readMessage(database, off.messageId))?.detectedEmail).toBeNull()
      })
    },
    90_000,
  )
})
