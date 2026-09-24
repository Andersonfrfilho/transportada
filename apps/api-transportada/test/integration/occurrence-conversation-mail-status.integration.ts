/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T405 (RF14), contra Postgres real: o status que o webhook do Resend traz chega à mensagem
 * da conversa pelo id do provedor, dentro da empresa do webhook, e pela política — só avança, e a
 * devolução depois da entrega não desfaz a entrega. Outra empresa com o mesmo id não muda nada.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { occurrenceConversationMessages } from '../../src/database/database.schema.js'
import { createDrizzleOccurrenceMailStatusRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail-status.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

describe('status do Resend na mensagem da conversa (spec 183 T405)', () => {
  testWithPostgres(
    'entregue avança, devolvido depois não desfaz, e outra empresa não toca',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const { companyId, userId } = seeded.company
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: userId,
          bodyText: 'Autorizam a descarga?',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-1',
          idempotencyKey: 'conversation-status-key-0001',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })
        /** O worker grava o id do Resend quando o envio é aceito (T405, lado do worker). */
        await database.db
          .update(occurrenceConversationMessages)
          .set({ providerMessageId: 'em_status_1', status: 'sent' })
          .where(eq(occurrenceConversationMessages.id, sent.conversationMessageId))
        const status = createDrizzleOccurrenceMailStatusRepository(database.db)
        const read = async () =>
          (
            await database.db
              .select({
                status: occurrenceConversationMessages.status,
                statusTimes: occurrenceConversationMessages.statusTimes,
              })
              .from(occurrenceConversationMessages)
              .where(eq(occurrenceConversationMessages.id, sent.conversationMessageId))
          )[0]

        await status.apply({
          at: new Date('2026-09-24T12:00:00.000Z'),
          companyId: other.companyId,
          incoming: 'delivered',
          providerEmailId: 'em_status_1',
        })
        expect((await read())?.status).toBe('sent')

        await status.apply({
          at: new Date('2026-09-24T12:01:00.000Z'),
          companyId,
          incoming: 'delivered',
          providerEmailId: 'em_status_1',
        })
        await status.apply({
          at: new Date('2026-09-24T12:02:00.000Z'),
          companyId,
          incoming: 'bounced',
          providerEmailId: 'em_status_1',
        })
        await status.apply({
          at: new Date('2026-09-24T12:03:00.000Z'),
          companyId,
          incoming: 'delivered',
          providerEmailId: 'id-que-nao-e-de-conversa',
        })

        const message = await read()
        expect(message?.status).toBe('delivered')
        expect(message?.statusTimes.delivered).toBe('2026-09-24T12:01:00.000Z')
        expect(message?.statusTimes.bounced).toBeUndefined()
      })
    },
    30_000,
  )
})
