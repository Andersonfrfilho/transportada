/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { whatsappCanhotoQuestions } from '../../database/whatsapp-canhoto-question.schema.js'
import type {
  WhatsAppCanhotoQuestion,
  WhatsAppCanhotoQuestionRepositoryPort,
} from '../application/whatsapp-canhoto-recognition.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPEN_UNIQUE = 'whatsapp_canhoto_questions_company_driver_open_unique'

const COLUMNS = {
  candidates: whatsappCanhotoQuestions.candidates,
  companyId: whatsappCanhotoQuestions.companyId,
  driverId: whatsappCanhotoQuestions.driverId,
  id: whatsappCanhotoQuestions.id,
  kind: whatsappCanhotoQuestions.kind,
  mimeType: whatsappCanhotoQuestions.mimeType,
  objectKey: whatsappCanhotoQuestions.objectKey,
  openedAt: whatsappCanhotoQuestions.openedAt,
  originChannel: whatsappCanhotoQuestions.originChannel,
  providerMessageId: whatsappCanhotoQuestions.providerMessageId,
}

/** Spec 294 T4.8: a pergunta aberta sobre a foto do canhoto, sempre por empresa e motorista. */
export function createDrizzleWhatsAppCanhotoQuestionRepository(
  database: Database,
): WhatsAppCanhotoQuestionRepositoryPort {
  const openOf = (companyId: string) =>
    and(
      eq(whatsappCanhotoQuestions.companyId, companyId),
      eq(whatsappCanhotoQuestions.status, 'open'),
    )

  return {
    async close(input) {
      await database
        .update(whatsappCanhotoQuestions)
        .set({ closedAt: sql`now()`, status: input.status })
        .where(and(openOf(input.companyId), eq(whatsappCanhotoQuestions.id, input.id)))
    },

    async findOpen(input) {
      const [row] = await database
        .select(COLUMNS)
        .from(whatsappCanhotoQuestions)
        .where(and(openOf(input.companyId), eq(whatsappCanhotoQuestions.driverId, input.driverId)))
        .limit(1)
      return row ?? null
    },

    async open(input) {
      try {
        const [row] = await database
          .insert(whatsappCanhotoQuestions)
          .values({
            candidates: [...input.candidates],
            companyId: input.companyId,
            driverId: input.driverId,
            kind: input.kind,
            mimeType: input.mimeType,
            objectKey: input.objectKey,
            originChannel: input.originChannel,
            providerMessageId: input.providerMessageId,
            sha256: input.sha256,
            sizeBytes: input.sizeBytes,
          })
          .returning(COLUMNS)
        return (row ?? null) satisfies null | WhatsAppCanhotoQuestion
      } catch (error) {
        if (violatedUniqueConstraint(error) === OPEN_UNIQUE) return null
        throw error
      }
    },

    async reframe(input) {
      await database
        .update(whatsappCanhotoQuestions)
        .set({ candidates: [...input.candidates], kind: input.kind })
        .where(and(openOf(input.companyId), eq(whatsappCanhotoQuestions.id, input.id)))
    },
  }
}
