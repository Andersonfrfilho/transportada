/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: o que a suíte de integração do escritório por assunto repete — os casos de uso do
 * escritório sobre o Postgres, ao lado dos do motorista (mesmo banco, mesmo dublê de storage), o aviso
 * capturado em memória e o perfil com nome de quem escreve.
 */
import { createCloseTripSubjectConversationUseCase } from '../../src/occurrence-conversation/application/close-trip-subject-conversation.use-case.js'
import { createListOfficeSubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-office-subject-messages.use-case.js'
import { createListTripSubjectConversationsUseCase } from '../../src/occurrence-conversation/application/list-trip-subject-conversations.use-case.js'
import { createMarkOfficeSubjectReadUseCase } from '../../src/occurrence-conversation/application/mark-office-subject-read.use-case.js'
import { createOpenTripSubjectConversationUseCase } from '../../src/occurrence-conversation/application/open-trip-subject-conversation.use-case.js'
import type { OfficeSubjectNotifierPort } from '../../src/occurrence-conversation/application/office-subject-conversation.port.js'
import { createRequestOfficeSubjectUploadUseCase } from '../../src/occurrence-conversation/application/request-office-subject-upload.use-case.js'
import { createSendOfficeSubjectMessageUseCase } from '../../src/occurrence-conversation/application/send-office-subject-message.use-case.js'
import { createDrizzleConversationUploadRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-conversation-attachment.repository.js'
import { createDrizzleOfficeSubjectUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-office-subject-conversation.repository.js'
import { identityUserProfiles } from '../../src/database/database.schema.js'
import { createWriteHarness } from './driver-subject-conversation-write-database.fixture.js'
import type { TestDatabase } from './trip-field-office-database.fixture.js'

const BUCKET = 'transportada-test-conversation'

export const OFFICE_KEY = 'office-send-key-0001'

type Database = TestDatabase['db']

export function createOfficeHarness(
  database: Database,
  clock: () => Date = () => new Date(),
  notifierOverride?: OfficeSubjectNotifierPort,
) {
  const driverSide = createWriteHarness(database, clock)
  const unitOfWork = createDrizzleOfficeSubjectUnitOfWork(database)
  const notices: unknown[] = []
  const fingerprintService = {
    create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
      fields.map((field) => new TextDecoder().decode(field)).join('|'),
  }
  return {
    ...driverSide,
    notices,
    office: {
      close: createCloseTripSubjectConversationUseCase({ unitOfWork }),
      list: createListTripSubjectConversationsUseCase({ unitOfWork }),
      markRead: createMarkOfficeSubjectReadUseCase({ unitOfWork }),
      messages: createListOfficeSubjectMessagesUseCase({
        storage: driverSide.storage,
        unitOfWork,
      }),
      open: createOpenTripSubjectConversationUseCase({ unitOfWork }),
      send: createSendOfficeSubjectMessageUseCase({
        clock,
        fingerprintService,
        notifier: notifierOverride ?? { notify: async (input) => void notices.push(input) },
        storage: driverSide.storage,
        unitOfWork,
      }),
      unitOfWork,
      upload: createRequestOfficeSubjectUploadUseCase({
        bucket: BUCKET,
        clock,
        newId: () => crypto.randomUUID(),
        repository: createDrizzleConversationUploadRepository(database),
        storage: driverSide.storage,
        unitOfWork,
      }),
    },
  }
}

/** O nome que a mensagem mostra: operação pelo `author_user_id`, motorista pelo `driver_user_id`. */
export async function seedProfile(database: Database, userId: string, name: string): Promise<void> {
  await database
    .insert(identityUserProfiles)
    .values({
      contactAddress: `${userId}@example.com`,
      contactChannel: 'email',
      name,
      userId,
      username: `perfil.${userId.slice(0, 8)}`,
    })
    .onConflictDoNothing()
}
