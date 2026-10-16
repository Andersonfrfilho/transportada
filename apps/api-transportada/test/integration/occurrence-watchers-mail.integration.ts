/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267, contra Postgres real: o e-mail de ocorrência grava `cc_addresses` com a lista efetiva (contratante vence
 * empresa, lista só com inativos herda, remoção vale só para o envio, quem perdeu a permissão some sem erro) e a
 * prévia mostra a mesma lista, mascarada.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import {
  createOccurrenceMailReader,
  createOccurrenceSuggestedMailReader,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { DrizzleOccurrenceWatcherRepository } from '../../src/contractor-mail/infrastructure/drizzle-occurrence-watcher.repository.js'
import {
  contractorMailMessages,
  contractors,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function seedResponsible(database: TestDatabase, seeded: Seeded, name: string) {
  const userId = crypto.randomUUID()
  const address = `${name.toLowerCase()}@empresa.example.test`
  await database.db.insert(identityUsers).values({ id: userId })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: address,
    contactChannel: 'email',
    email: address,
    name,
    phone: '',
    taxId: '',
    userId,
    username: `${name.toLowerCase()}-${userId.slice(0, 8)}`,
  })
  const [membership] = await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: seeded.company.companyId, status: 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  const membershipId = membership?.id ?? ''
  await database.db.insert(membershipRoles).values({ membershipId, role: 'operator' })
  return { address, membershipId, userId }
}

async function readCopy(database: TestDatabase, mailMessageId: string) {
  const [row] = await database.db
    .select({ cc: contractorMailMessages.ccAddresses, to: contractorMailMessages.toAddresses })
    .from(contractorMailMessages)
    .where(eq(contractorMailMessages.id, mailMessageId))
  return row
}

describe('a cópia do e-mail de ocorrência contra Postgres (spec 267)', () => {
  testWithPostgres(
    'lista efetiva: empresa, contratante vence, só inativos herda, remoção por envio, permissão perdida',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const [contractor] = await database.db
          .select({ id: contractors.id })
          .from(contractors)
          .where(eq(contractors.companyId, seeded.company.companyId))
        const contractorId = contractor?.id ?? ''
        const ana = await seedResponsible(database, seeded, 'Ana')
        const bruno = await seedResponsible(database, seeded, 'Bruno')
        const carla = await seedResponsible(database, seeded, 'Carla')
        const watchers = new DrizzleOccurrenceWatcherRepository(database.db)
        const company = { companyId: seeded.company.companyId, kind: 'company' } as const
        const forContractor = { ...company, contractorId, kind: 'contractor' } as const
        const base = { actorUserId: seeded.company.userId, correlationId: 'corr-watchers' }
        for (const member of [ana, bruno]) {
          await watchers.addWatcher({ ...base, scope: company, userId: member.userId })
        }
        const useCase = createOccurrenceMailUseCase(database)
        let sequence = 0
        const send = async (excludedWatcherUserIds: readonly string[] = []) => {
          sequence += 1
          const result = await useCase.send({
            actorUserId: seeded.company.userId,
            bodyText: 'Autorizam?',
            companyId: seeded.company.companyId,
            contactIds: seeded.contactIds.slice(0, 2),
            correlationId: `corr-${sequence}`,
            excludedWatcherUserIds,
            idempotencyKey: `key-${sequence}`,
            occurrenceId: seeded.occurrenceId,
            subject: 'Ocorrência — NF 1',
          })
          return readCopy(database, result.mailMessageId)
        }

        expect((await send())?.cc).toEqual([ana.address, bruno.address])
        const removed = await send([bruno.userId])
        expect(removed?.cc).toEqual([ana.address])
        expect(removed?.to).toEqual(['compras@alfa.example.test', 'fiscal@alfa.example.test'])
        expect((await send())?.cc).toEqual([ana.address, bruno.address])

        await watchers.addWatcher({ ...base, scope: forContractor, userId: carla.userId })
        expect((await send())?.cc).toEqual([carla.address])
        await watchers.setWatcherStatus({
          ...base,
          scope: forContractor,
          status: 'inactive',
          userId: carla.userId,
        })
        expect((await send())?.cc).toEqual([ana.address, bruno.address])

        await database.db
          .delete(membershipRoles)
          .where(eq(membershipRoles.membershipId, ana.membershipId))
        expect((await send())?.cc).toEqual([bruno.address])

        const preview = await createPreviewOccurrenceMailUseCase({
          reader: createOccurrenceMailReader(database.db),
          suggestedMail: createOccurrenceSuggestedMailReader(database.db),
        }).preview({
          actorUserId: seeded.company.userId,
          companyId: seeded.company.companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(preview.ccSource).toBe('company')
        expect(preview.cc).toEqual([
          { maskedEmail: 'b***@e***.example.test', name: 'Bruno', userId: bruno.userId },
        ])
      })
    },
    90_000,
  )

  testWithPostgres(
    'sem nenhuma lista a mensagem grava cópia vazia',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const result = await createOccurrenceMailUseCase(database).send({
          actorUserId: seeded.company.userId,
          bodyText: 'Texto',
          companyId: seeded.company.companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'corr-empty',
          idempotencyKey: 'key-empty',
          occurrenceId: seeded.occurrenceId,
          subject: 'Assunto',
        })
        expect((await readCopy(database, result.mailMessageId))?.cc).toEqual([])
      })
    },
    60_000,
  )
})
