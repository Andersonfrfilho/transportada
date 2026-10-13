/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3: o que as suítes de integração da transcrição repetem — anexo de áudio gravado à mão (com o
 * objeto guardado, que a leitura exige), a configuração da empresa e uma mensagem com áudio.
 */
import { createHash } from 'node:crypto'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAttachments,
  storedObjects,
} from '../../src/database/database.schema.js'
import { insertSubjectMessage } from './driver-subject-conversation-database.fixture.js'
import type { TestDatabase } from './trip-field-office-database.fixture.js'

type Database = TestDatabase['db']

export type AudioMessageSeed = {
  readonly companyId: string
  readonly contentType?: string
  readonly conversationId: string
  readonly createdAt: Date
  readonly direction?: 'inbound' | 'outbound'
  readonly driverUserId: string
  readonly durationMs?: number
  readonly operatorUserId: string
}

export async function seedAttachment(
  database: Database,
  seed: {
    readonly companyId: string
    readonly contentType: string
    readonly durationMs?: number
    readonly messageId: string
  },
): Promise<string> {
  const objectId = crypto.randomUUID()
  const sha256 = createHash('sha256').update(objectId).digest('hex')
  await database.insert(storedObjects).values({
    bucket: 'transportada-test-conversation',
    companyId: seed.companyId,
    id: objectId,
    mimeType: seed.contentType,
    objectKey: `occurrence-conversations/${objectId}`,
    provider: 's3',
    purpose: 'occurrence_conversation_attachment',
    sha256,
    sizeBytes: 1024n,
    status: 'final',
  })
  const [row] = await database
    .insert(occurrenceConversationAttachments)
    .values({
      companyId: seed.companyId,
      contentType: seed.contentType,
      durationMs: seed.durationMs ?? null,
      fileName: 'anexo',
      messageId: seed.messageId,
      sha256,
      sizeBytes: 1024,
      storedObjectId: objectId,
    })
    .returning({ id: occurrenceConversationAttachments.id })
  if (row === undefined) throw new Error('EXPECTED_ATTACHMENT')
  return row.id
}

/** Uma mensagem do app com um anexo; áudio por padrão. */
export async function seedAudioMessage(
  database: Database,
  seed: AudioMessageSeed,
): Promise<{ readonly attachmentId: string; readonly messageId: string }> {
  const messageId = await insertSubjectMessage(database, {
    body: 'áudio',
    conversationId: seed.conversationId,
    createdAt: seed.createdAt,
    direction: seed.direction ?? 'inbound',
    driverUserId: seed.driverUserId,
    operatorUserId: seed.operatorUserId,
  })
  const attachmentId = await seedAttachment(database, {
    companyId: seed.companyId,
    contentType: seed.contentType ?? 'audio/ogg',
    ...(seed.durationMs === undefined ? {} : { durationMs: seed.durationMs }),
    messageId,
  })
  return { attachmentId, messageId }
}

export async function setAudioTranscriptionEnabled(
  database: Database,
  companyId: string,
  enabled: boolean,
): Promise<void> {
  await database
    .insert(companyAudioTranscriptionSettings)
    .values({ companyId, enabled })
    .onConflictDoUpdate({
      set: { enabled },
      target: companyAudioTranscriptionSettings.companyId,
    })
}
