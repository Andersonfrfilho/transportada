/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3b (ADR-0101 decisão 5), contra Postgres real e o repositório de verdade: os caminhos de
 * inserção que já existiam (aqui o do motorista, com `onConflictDoNothing` e `onConflictDoUpdate`, e o
 * INSERT do Drizzle que não cita a coluna) continuam funcionando sem mudar uma linha, e o protocolo que o
 * banco deu à conversa sobrevive ao retarget do motorista principal.
 */
import { eq } from 'drizzle-orm'
import { describe, expect } from 'bun:test'

import { occurrenceConversations } from '../../src/database/database.schema.js'
import { CONVERSATION_PROTOCOL_PATTERN } from '../../src/shared/occurrence-conversation-subject.constant.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'

const FORMAT = new RegExp(CONVERSATION_PROTOCOL_PATTERN, 'u')

describe('o protocolo da conversa contra Postgres (spec 260 T2.3b)', () => {
  testWithPostgres(
    'o upsert do motorista e o retarget não mudam o protocolo, e o INSERT sem a coluna recebe um',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, firstDriverId, userId } = seeded.company
        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
        const subject = {
          companyId,
          occurrenceId: crypto.randomUUID(),
          occurrenceKind: 'document',
        } as const

        const created = await unitOfWork.execute((port) =>
          port.findOrCreateDriverConversation({ ...subject, driverUserId, retarget: false }),
        )
        const [before] = await database.db
          .select({ protocol: occurrenceConversations.protocol })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, created.id))
        expect(before?.protocol).toMatch(FORMAT)

        const kept = await unitOfWork.execute((port) =>
          port.findOrCreateDriverConversation({
            ...subject,
            driverUserId: userId,
            retarget: false,
          }),
        )
        expect(kept).toEqual({ driverUserId, id: created.id })

        const retargeted = await unitOfWork.execute((port) =>
          port.findOrCreateDriverConversation({ ...subject, driverUserId: userId, retarget: true }),
        )
        expect(retargeted).toEqual({ driverUserId: userId, id: created.id })
        const [after] = await database.db
          .select({ protocol: occurrenceConversations.protocol })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, created.id))
        expect(after).toEqual(before)

        const [plain] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            driverUserId,
            occurrenceId: crypto.randomUUID(),
            occurrenceKind: 'stop',
            participant: 'driver',
          })
          .returning({ protocol: occurrenceConversations.protocol })
        expect(plain?.protocol).toMatch(FORMAT)
        expect(plain?.protocol).not.toBe(before?.protocol)
      })
    },
    120_000,
  )
})
