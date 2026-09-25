/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9), contra Postgres real: a contratante acha a conversa pela referência
 * opaca só quando a tratativa já está visível ao portal e a conversa é com uma contratante do recorte
 * dela; o que ela escreve entra na mesma conversa que o operador lê, pelo canal `portal`; a lida é da
 * conta dela. A listagem cria a conversa que ainda não existia, uma vez só. Outra contratante, outra
 * empresa e tratativa ainda interna respondem igual a inexistente.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractors,
  identityUsers,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripOccurrenceCases,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { createContractorPortalConversationUseCase } from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import { createPublicRef } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { createDrizzleContractorPortalConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-portal-conversation.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

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
        expect(refs.get(seeded.occurrenceId)).toBe(ref)

        const before = await useCase.read({ context: portal, ref })
        expect(before).toEqual({
          messages: [
            {
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

        const ref = first.get(seeded.occurrenceId)
        expect(ref).toMatch(/^[A-Za-z0-9_-]{22,64}$/u)
        expect(second.get(seeded.occurrenceId)).toBe(ref)
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
          ref: ref ?? '',
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
          ).get(seeded.occurrenceId) ?? ''

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
