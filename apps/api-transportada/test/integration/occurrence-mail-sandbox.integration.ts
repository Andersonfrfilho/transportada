/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 268, contra Postgres real: sem o Resend pronto e com o modo sandbox ligado, o e-mail de ocorrência é
 * gravado para o SMTP do ambiente (`transport = 'sandbox_smtp'`, remetente do ambiente, nada decifrado); com o
 * Resend pronto continua `resend`; o CHECK da coluna recusa transporte fora da lista.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailSettings,
  contractorMailThreads,
} from '../../src/database/database.schema.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { DrizzleOccurrenceMailRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const SANDBOX_SENDER = 'no-reply@staging.example.test'

function createSandboxUseCase(database: TestDatabase, decryptCalls: string[]) {
  return createSendOccurrenceMailUseCase({
    contractorMailSandbox: { fromAddress: SANDBOX_SENDER },
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => new Date('2026-10-16T12:00:00.000Z'),
    secretService: {
      decrypt: async () => {
        decryptCalls.push('decrypt')
        return { apiKey: 're_test', replyTokenSecret: 'b'.repeat(64) }
      },
    } as never,
    storage: {} as never,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

function sendInput(companyId: string, occurrenceId: string, contactIds: readonly string[]) {
  return {
    actorUserId: null,
    automatic: true,
    bodyText: 'Caixa violada na separação.',
    companyId,
    contactIds,
    correlationId: `correlation-${crypto.randomUUID()}`,
    idempotencyKey: `key-${crypto.randomUUID()}`,
    occurrenceId,
    subject: 'Ocorrência — NF 4512',
  }
}

describe('o e-mail da contratante em modo sandbox (spec 268)', () => {
  testWithPostgres(
    'empresa sem configuração: grava sandbox_smtp, com o remetente do ambiente e sem decifrar nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await database.db
          .delete(contractorMailSettings)
          .where(eq(contractorMailSettings.companyId, companyId))
        const decryptCalls: string[] = []

        const result = await createSandboxUseCase(database, decryptCalls).send(
          sendInput(companyId, seeded.occurrenceId, seeded.contactIds.slice(0, 2)),
        )

        const [message] = await database.db
          .select()
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.id, result.mailMessageId))
        expect(message).toMatchObject({
          deliveryStatus: 'queued',
          direction: 'outbound',
          fromAddress: SANDBOX_SENDER,
          transport: 'sandbox_smtp',
        })
        expect([...(message?.toAddresses ?? [])].sort()).toEqual([
          'compras@alfa.example.test',
          'fiscal@alfa.example.test',
        ])
        const [thread] = await database.db
          .select({ hash: contractorMailThreads.replyTokenHash })
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, result.threadId))
        expect(thread?.hash).toMatch(/^[0-9a-f]{64}$/u)
        expect(decryptCalls).toEqual([])
      })
    },
  )

  testWithPostgres(
    'empresa com o Resend pronto: continua resend, mesmo com o modo ligado',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const decryptCalls: string[] = []

        const result = await createSandboxUseCase(database, decryptCalls).send(
          sendInput(seeded.company.companyId, seeded.occurrenceId, seeded.contactIds.slice(0, 2)),
        )

        const [message] = await database.db
          .select({
            fromAddress: contractorMailMessages.fromAddress,
            transport: contractorMailMessages.transport,
          })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.id, result.mailMessageId))
        expect(message).toEqual({
          fromAddress: 'ocorrencias@transportadora.example.test',
          transport: 'resend',
        })
        expect(decryptCalls).toEqual(['decrypt'])
      })
    },
  )

  testWithPostgres('o CHECK da coluna recusa transporte fora da lista', async () => {
    await withConversationDatabase(async (database) => {
      const seeded = await seedMailScenario(database)
      const result = await createSandboxUseCase(database, []).send(
        sendInput(seeded.company.companyId, seeded.occurrenceId, seeded.contactIds.slice(0, 1)),
      )

      const invalidUpdate = async (): Promise<void> => {
        await database.db
          .update(contractorMailMessages)
          .set({ transport: 'carrier_pigeon' as never })
          .where(eq(contractorMailMessages.id, result.mailMessageId))
      }
      await expect(invalidUpdate()).rejects.toThrow()
    })
  })
})
