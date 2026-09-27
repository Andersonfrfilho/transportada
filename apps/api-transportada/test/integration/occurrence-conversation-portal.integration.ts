/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9), contra Postgres real: a contratante acha a conversa pela referência
 * opaca só quando a tratativa já está visível ao portal e a conversa é com uma contratante do recorte
 * dela; o que ela escreve entra na mesma conversa que o operador lê, pelo canal `portal`; a lida é da
 * conta dela. A listagem cria a conversa que ainda não existia, uma vez só. Outra contratante, outra
 * empresa e tratativa ainda interna respondem igual a inexistente.
 *
 * T654: a operação escreve pelo canal Portal só quando o portal mostra a ocorrência e há conta ligada
 * à contratante; a mensagem nasce entregue, o portal a lê do lado da transportadora e a lida da
 * conta a leva a `read`.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractorPortalBindings,
  contractors,
  identityUsers,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
  storedObjects,
  tripOccurrenceCases,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { createContractorPortalConversationUseCase } from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import { createSendContractorPortalMessageUseCase } from '../../src/occurrence-conversation/application/contractor-portal-message.use-case.js'
import { createPublicRef } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { createDrizzleContractorPortalConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-portal-conversation.repository.js'
import { createDrizzleContractorPortalMessageUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-portal-message.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'

const EMITTER_TAX_ID = '11222333000181'

async function seedPortalUser(database: TestDatabase, companyId: string): Promise<CompanyContext> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  return {
    companyId,
    kind: 'company',
    membershipId,
    permissions: new Set(['deliveries.track']),
    roles: ['contractor'],
    userId,
  }
}

/**
 * Spec 183 T702d: uma foto que o motorista mandou pela conversa **dele** desta ocorrência — linhas
 * diretas, porque o que se prova aqui é o encaminhamento, não o upload (T702a).
 */
async function seedDriverPhoto(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly occurrenceId: string
  },
): Promise<{ readonly attachmentId: string; readonly storedObjectId: string }> {
  const [conversation] = await database.db
    .insert(occurrenceConversations)
    .values({
      companyId: input.companyId,
      driverUserId: input.driverUserId,
      occurrenceId: input.occurrenceId,
      occurrenceKind: 'document',
      participant: 'driver',
    })
    .returning({ id: occurrenceConversations.id })
  const [message] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: 'Caixa amassada.',
      channel: 'app',
      companyId: input.companyId,
      conversationId: conversation?.id ?? '',
      direction: 'inbound',
      driverUserId: input.driverUserId,
    })
    .returning({ id: occurrenceConversationMessages.id })
  const storedObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'bucket-privado',
    companyId: input.companyId,
    id: storedObjectId,
    mimeType: 'image/jpeg',
    objectKey: `occurrence-conversations/${crypto.randomUUID()}`,
    provider: 's3',
    purpose: 'occurrence_conversation_attachment',
    sha256: 'a'.repeat(64),
    sizeBytes: 12n,
    status: 'final',
  })
  const [attachment] = await database.db
    .insert(occurrenceConversationAttachments)
    .values({
      companyId: input.companyId,
      contentType: 'image/jpeg',
      fileName: 'caixa.jpg',
      messageId: message?.id ?? '',
      sha256: 'a'.repeat(64),
      sizeBytes: 12,
      storedObjectId,
    })
    .returning({ id: occurrenceConversationAttachments.id })
  return { attachmentId: attachment?.id ?? '', storedObjectId }
}

async function contractorIdOf(database: TestDatabase, companyId: string): Promise<string> {
  const [row] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, companyId))
  if (row === undefined) throw new Error('EXPECTED_CONTRACTOR')
  return row.id
}

async function setCaseStatus(
  database: TestDatabase,
  seeded: Seeded,
  status: 'awaiting_contractor' | 'under_review',
): Promise<void> {
  const updated = await database.db
    .update(tripOccurrenceCases)
    .set({ status })
    .where(
      and(
        eq(tripOccurrenceCases.companyId, seeded.company.companyId),
        eq(tripOccurrenceCases.occurrenceId, seeded.occurrenceId),
      ),
    )
    .returning({ id: tripOccurrenceCases.id })
  if (updated.length !== 1) throw new Error('EXPECTED_CASE')
}

function createUseCase(
  database: TestDatabase,
  scopeOf: () => ReturnType<typeof resolveContractorScope>,
) {
  return createContractorPortalConversationUseCase({
    clock: () => new Date(),
    fingerprintService: {
      create: async ({ fields, operation }) =>
        `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
    },
    newRef: createPublicRef,
    scopes: { resolveScope: async () => scopeOf() },
    storage: UNUSED_ATTACHMENT_STORAGE,
    unitOfWork: createDrizzleContractorPortalConversationUnitOfWork(database.db),
  })
}

describe('a conversa da contratante pelo portal contra Postgres (spec 183 T651)', () => {
  testWithPostgres(
    'referência pela listagem, leitura, envio que o operador lê e lida por conta',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId: operatorUserId } = seeded.company
        const portal = await seedPortalUser(database, companyId)
        const scope = resolveContractorScope([
          { contractorId: await contractorIdOf(database, companyId), taxId: EMITTER_TAX_ID },
        ])
        const useCase = createUseCase(database, () => scope)
        await createOccurrenceMailUseCase(database).send({
          actorUserId: operatorUserId,
          bodyText: 'O recebedor recusou a caixa 3.',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-portal-1',
          idempotencyKey: 'conversation-portal-key-0001',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })
        const [existing] = await database.db
          .select({ publicRef: occurrenceConversations.publicRef })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.companyId, companyId))
        const ref = existing?.publicRef ?? ''

        /** Tratativa ainda interna: nem referência, nem conversa. */
        await setCaseStatus(database, seeded, 'under_review')
        const internal = await useCase.conversationRefs({
          context: portal,
          occurrenceIds: [seeded.occurrenceId],
        })
        expect(internal.size).toBe(0)
        await expect(useCase.read({ context: portal, ref })).rejects.toMatchObject({ status: 404 })

        await setCaseStatus(database, seeded, 'awaiting_contractor')
        const refs = await useCase.conversationRefs({
          context: portal,
          occurrenceIds: [seeded.occurrenceId],
        })
        expect(refs.get(seeded.occurrenceId)).toEqual({ ref, unreadCount: 1 })

        const before = await useCase.read({ context: portal, ref })
        expect(before).toEqual({
          messages: [
            {
              attachments: [],
              body: 'O recebedor recusou a caixa 3.',
              channel: 'email',
              createdAt: expect.any(String),
              mine: false,
              side: 'carrier',
            },
          ],
          unreadCount: 1,
        })

        const send = () =>
          useCase.send({
            bodyText: 'Mandei a nota de devolução.',
            context: portal,
            idempotencyKey: 'portal-send-key-0001',
            ref,
          })
        const first = await send()
        expect(await send()).toEqual(first)

        const operatorView = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId: operatorUserId,
        })
        const received = operatorView?.conversations[0]?.messages.at(-1)
        expect(received).toMatchObject({
          author: { identity: null, kind: 'contractor', userId: portal.userId },
          bodyText: 'Mandei a nota de devolução.',
          channel: 'portal',
          direction: 'inbound',
          status: null,
        })
        expect(operatorView?.conversations[0]?.messages).toHaveLength(2)

        await useCase.markRead({ context: portal, ref })
        const after = await useCase.read({ context: portal, ref })
        expect(after.unreadCount).toBe(0)
        /** Spec 183 T653: a listagem traz as não lidas da conta, e a lida zera. */
        const listed = await useCase.conversationRefs({
          context: portal,
          occurrenceIds: [seeded.occurrenceId],
        })
        expect(listed.get(seeded.occurrenceId)).toEqual({ ref, unreadCount: 0 })
        expect(after.messages.at(-1)).toMatchObject({ mine: true, side: 'contractor' })
      })
    },
    30_000,
  )

  testWithPostgres(
    'a listagem cria a conversa que ainda não existia, uma vez só',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const portal = await seedPortalUser(database, companyId)
        const scope = resolveContractorScope([
          { contractorId: await contractorIdOf(database, companyId), taxId: EMITTER_TAX_ID },
        ])
        await setCaseStatus(database, seeded, 'awaiting_contractor')
        const useCase = createUseCase(database, () => scope)

        const first = await useCase.conversationRefs({
          context: portal,
          occurrenceIds: [seeded.occurrenceId],
        })
        const second = await useCase.conversationRefs({
          context: portal,
          occurrenceIds: [seeded.occurrenceId],
        })

        const ref = first.get(seeded.occurrenceId)?.ref ?? ''
        expect(ref).toMatch(/^[A-Za-z0-9_-]{22,64}$/u)
        expect(second.get(seeded.occurrenceId)).toEqual({ ref, unreadCount: 0 })
        const rows = await database.db
          .select({ id: occurrenceConversations.id })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.companyId, companyId))
        expect(rows).toHaveLength(1)

        /** A contratante escreve primeiro. */
        await useCase.send({
          bodyText: 'Qual caixa?',
          context: portal,
          idempotencyKey: 'portal-send-key-0002',
          ref,
        })
        const messages = await database.db
          .select({ channel: occurrenceConversationMessages.channel })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
        expect(messages).toEqual([{ channel: 'portal' }])
      })
    },
    30_000,
  )

  testWithPostgres(
    'outra contratante e outra empresa respondem igual a inexistente, e não ganham referência',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await setCaseStatus(database, seeded, 'awaiting_contractor')
        const portal = await seedPortalUser(database, companyId)
        const alfa = resolveContractorScope([
          { contractorId: await contractorIdOf(database, companyId), taxId: EMITTER_TAX_ID },
        ])
        const ref =
          (
            await createUseCase(database, () => alfa).conversationRefs({
              context: portal,
              occurrenceIds: [seeded.occurrenceId],
            })
          ).get(seeded.occurrenceId)?.ref ?? ''

        /** Outra contratante da mesma empresa — o recebedor, por exemplo, com vínculo próprio. */
        const betaId = crypto.randomUUID()
        await database.db
          .insert(contractors)
          .values({ companyId, displayName: 'Beta', id: betaId, taxId: '99888777000166' })
        const beta = createUseCase(database, () =>
          resolveContractorScope([{ contractorId: betaId, taxId: '99888777000166' }]),
        )
        expect(
          (await beta.conversationRefs({ context: portal, occurrenceIds: [seeded.occurrenceId] }))
            .size,
        ).toBe(0)
        await expect(beta.read({ context: portal, ref })).rejects.toMatchObject({ status: 404 })

        /** Outra empresa, com a mesma referência na mão. */
        const other = await seedCompany(database)
        const otherPortal = await seedPortalUser(database, other.companyId)
        await expect(
          createUseCase(database, () => alfa).read({ context: otherPortal, ref }),
        ).rejects.toMatchObject({ status: 404 })
        await expect(
          createUseCase(database, () => alfa).send({
            bodyText: 'Oi',
            context: otherPortal,
            idempotencyKey: 'portal-send-key-0003',
            ref,
          }),
        ).rejects.toMatchObject({ status: 404 })
      })
    },
    30_000,
  )
})

describe('a operação escreve pelo portal, contra Postgres (spec 183 T654)', () => {
  testWithPostgres(
    'só com a ocorrência visível e conta ligada; nasce entregue, o portal lê e vira lida',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId: operatorUserId } = seeded.company
        const contractorId = await contractorIdOf(database, companyId)
        const portal = await seedPortalUser(database, companyId)
        const notices: unknown[] = []
        const send = (bodyText: string, idempotencyKey: string) =>
          createSendContractorPortalMessageUseCase({
            clock: () => new Date(),
            fingerprintService: {
              create: async ({ fields, operation }) =>
                `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
            },
            newRef: createPublicRef,
            notifier: { notify: async (input) => void notices.push(input) },
            storage: UNUSED_ATTACHMENT_STORAGE,
            unitOfWork: createDrizzleContractorPortalMessageUnitOfWork(database.db),
          }).send({
            actorUserId: operatorUserId,
            bodyText,
            companyId,
            idempotencyKey,
            occurrenceId: seeded.occurrenceId,
          })
        const portalAvailable = async () =>
          (
            await findOccurrenceConversations(database.db, {
              companyId,
              occurrenceId: seeded.occurrenceId,
              userId: operatorUserId,
            })
          )?.contractorPortal.available

        /** Tratativa ainda interna: o portal não mostra. */
        await setCaseStatus(database, seeded, 'under_review')
        await database.db
          .insert(contractorPortalBindings)
          .values({ companyId, contractorId, membershipId: portal.membershipId })
        expect(await portalAvailable()).toBe(false)
        await expect(send('Oi', 'portal-operator-key-0001')).rejects.toMatchObject({ status: 409 })

        await setCaseStatus(database, seeded, 'awaiting_contractor')
        expect(await portalAvailable()).toBe(true)
        const sent = await send('Recebemos a nota de devolução.', 'portal-operator-key-0002')
        expect(await send('Recebemos a nota de devolução.', 'portal-operator-key-0002')).toEqual(
          sent,
        )
        expect(notices).toEqual([
          {
            companyId,
            messageId: sent.conversationMessageId,
            occurrenceLabel: expect.stringMatching(/^NF /u),
            recipientUserIds: [portal.userId],
          },
        ])

        const [stored] = await database.db
          .select({
            channel: occurrenceConversationMessages.channel,
            direction: occurrenceConversationMessages.direction,
            status: occurrenceConversationMessages.status,
            statusTimes: occurrenceConversationMessages.statusTimes,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, sent.conversationMessageId))
        expect(stored).toMatchObject({
          channel: 'portal',
          direction: 'outbound',
          status: 'delivered',
        })
        expect(typeof stored?.statusTimes.delivered).toBe('string')

        const scope = resolveContractorScope([{ contractorId, taxId: EMITTER_TAX_ID }])
        const portalSide = createUseCase(database, () => scope)
        const ref =
          (
            await portalSide.conversationRefs({
              context: portal,
              occurrenceIds: [seeded.occurrenceId],
            })
          ).get(seeded.occurrenceId)?.ref ?? ''
        const read = await portalSide.read({ context: portal, ref })
        expect(read.messages).toEqual([
          {
            attachments: [],
            body: 'Recebemos a nota de devolução.',
            channel: 'portal',
            createdAt: expect.any(String),
            mine: false,
            side: 'carrier',
          },
        ])

        await portalSide.markRead({ context: portal, ref })
        const [afterRead] = await database.db
          .select({
            status: occurrenceConversationMessages.status,
            statusTimes: occurrenceConversationMessages.statusTimes,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, sent.conversationMessageId))
        expect(afterRead?.status).toBe('read')
        expect(typeof afterRead?.statusTimes.read).toBe('string')
        expect(afterRead?.statusTimes.delivered).toBe(stored?.statusTimes.delivered)
      })
    },
    30_000,
  )

  testWithPostgres(
    'T702d: a foto do motorista vai à contratante pelo mesmo objeto; de outra ocorrência ou empresa, não',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedMailScenario(database)
        const { companyId, userId: operatorUserId } = seeded.company
        const contractorId = await contractorIdOf(database, companyId)
        const portal = await seedPortalUser(database, companyId)
        await setCaseStatus(database, seeded, 'awaiting_contractor')
        await database.db
          .insert(contractorPortalBindings)
          .values({ companyId, contractorId, membershipId: portal.membershipId })
        const photo = await seedDriverPhoto(database, {
          companyId,
          driverUserId: operatorUserId,
          occurrenceId: seeded.occurrenceId,
        })
        const foreign = await seedDriverPhoto(database, {
          companyId: other.company.companyId,
          driverUserId: other.company.userId,
          occurrenceId: other.occurrenceId,
        })
        const send = (forwardAttachmentIds: readonly string[], idempotencyKey: string) =>
          createSendContractorPortalMessageUseCase({
            clock: () => new Date(),
            fingerprintService: {
              create: async ({ fields, operation }) =>
                `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
            },
            newRef: createPublicRef,
            notifier: { notify: async () => undefined },
            storage: UNUSED_ATTACHMENT_STORAGE,
            unitOfWork: createDrizzleContractorPortalMessageUnitOfWork(database.db),
          }).send({
            actorUserId: operatorUserId,
            bodyText: '',
            companyId,
            forwardAttachmentIds,
            idempotencyKey,
            occurrenceId: seeded.occurrenceId,
          })
        const portalMessages = async () =>
          database.db
            .select({ id: occurrenceConversationMessages.id })
            .from(occurrenceConversationMessages)
            .where(
              and(
                eq(occurrenceConversationMessages.companyId, companyId),
                eq(occurrenceConversationMessages.channel, 'portal'),
              ),
            )

        /** Anexo de outra empresa: 422 e nenhuma mensagem fica. */
        await expect(send([foreign.attachmentId], 'forward-key-0001')).rejects.toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_FORWARD_INVALID',
          status: 422,
        })
        expect(await portalMessages()).toEqual([])

        const sent = await send([photo.attachmentId], 'forward-key-0002')
        const forwarded = await database.db
          .select({
            fileName: occurrenceConversationAttachments.fileName,
            storedObjectId: occurrenceConversationAttachments.storedObjectId,
          })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.messageId, sent.conversationMessageId))
        expect(forwarded).toEqual([{ fileName: 'caixa.jpg', storedObjectId: photo.storedObjectId }])

        /** Anexo que já é da conversa da contratante não é "do motorista": não se encaminha. */
        const [contractorCopy] = await database.db
          .select({ id: occurrenceConversationAttachments.id })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.messageId, sent.conversationMessageId))
        await expect(send([contractorCopy?.id ?? ''], 'forward-key-0003')).rejects.toMatchObject({
          status: 422,
        })
        expect(await portalMessages()).toHaveLength(1)
      })
    },
    30_000,
  )

  testWithPostgres(
    'sem conta do portal ligada à contratante, o canal não está disponível',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setCaseStatus(database, seeded, 'awaiting_contractor')

        const view = await findOccurrenceConversations(database.db, {
          companyId: seeded.company.companyId,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })

        expect(view?.contractorPortal).toEqual({ available: false })
      })
    },
    30_000,
  )
})
