/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: opens the contractor reply of an occurrence through the production path (the automatic mail)
 * and moves it the way the contractor's answer does (`applyContractorReplyToMessage`). Copied from
 * `occurrence-contractor-reply-received.integration.ts` without `bun:test`.
 */
import { eq, and } from 'drizzle-orm'

import {
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  storedObjects,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { applyContractorReplyToMessage } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-contractor-reply.repository.js'
import {
  createAutomaticOccurrenceMailReader,
  DrizzleOccurrenceMailRepository,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../../test/fixtures/conversation-attachment.fixture.js'
import { SCENARIO_BUCKET, SCENARIO_MAIL_DOMAIN } from './scenario.constant.js'
import type { ScenarioContext, ScenarioDatabase } from './scenario-fixtures.js'

const OVERDUE_BY_HOURS = 3
const LAST_ALERT_HOURS_AGO = 1
const OVERDUE_ALERT_COUNT = 2
const MILLISECONDS_PER_HOUR = 3_600_000

function createMailUseCase(database: ScenarioDatabase) {
  return createSendOccurrenceMailUseCase({
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => new Date(),
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'b'.repeat(64) }),
    } as never,
    storage: UNUSED_ATTACHMENT_STORAGE,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

export type OpenedReply = { readonly conversationId: string; readonly replyId: string }

/** Sends the automatic mail of the occurrence, which opens the reply `awaiting_contractor`. */
export async function openReply(
  context: ScenarioContext,
  occurrenceId: string,
): Promise<OpenedReply> {
  const { companyId, database } = context
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createMailUseCase(database),
  }).send({ companyId, correlationId: `teste-248-${crypto.randomUUID()}`, occurrenceId })
  const [reply] = await database.db
    .select({
      conversationId: occurrenceContractorReplies.conversationId,
      replyId: occurrenceContractorReplies.id,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
      ),
    )
  if (reply === undefined) {
    throw new Error(
      'EXPECTED_OPEN_REPLY: o aviso automático não abriu o retorno (e-mail da empresa verificado?)',
    )
  }
  return reply
}

/** The contractor's answer as the conversation keeps it: one inbound message and its attachments. */
export async function receiveReply(
  context: ScenarioContext,
  input: { readonly contentTypes: readonly string[]; readonly conversationId: string },
): Promise<string> {
  const { companyId, database } = context
  const [message] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: 'Segue o boleto.',
      channel: 'email',
      companyId,
      conversationId: input.conversationId,
      direction: 'inbound',
      senderAddress: `compras@${SCENARIO_MAIL_DOMAIN}`,
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (message === undefined) throw new Error('EXPECTED_MESSAGE')
  for (const [index, contentType] of input.contentTypes.entries()) {
    const [object] = await database.db
      .insert(storedObjects)
      .values({
        bucket: SCENARIO_BUCKET,
        companyId,
        mimeType: contentType,
        objectKey: `${SCENARIO_BUCKET}/occurrence-conversations/${crypto.randomUUID()}`,
        provider: 's3',
        purpose: 'occurrence_conversation_attachment',
        sha256: crypto.randomUUID().replaceAll('-', '').repeat(2),
        sizeBytes: 12n,
        status: 'final',
      })
      .returning({ id: storedObjects.id })
    await database.db.insert(occurrenceConversationAttachments).values({
      companyId,
      contentType,
      fileName: contentType === 'application/pdf' ? `boleto-${index + 1}.pdf` : 'foto.jpg',
      messageId: message.id,
      sha256: crypto.randomUUID().replaceAll('-', '').repeat(2),
      sizeBytes: 12,
      storedObjectId: object?.id ?? '',
    })
  }
  return message.id
}

export function applyReply(
  context: ScenarioContext,
  input: { readonly conversationId: string; readonly messageId: string },
): Promise<void> {
  const { companyId, database } = context
  return database.db.transaction((transaction) =>
    applyContractorReplyToMessage(transaction, { ...input, companyId, now: new Date() }),
  )
}

/** The deadline passed with two alerts already sent: the state the alarm routine leaves behind. */
export async function markReplyOverdue(context: ScenarioContext, replyId: string): Promise<void> {
  const { companyId, database } = context
  const now = Date.now()
  await database.db
    .update(occurrenceContractorReplies)
    .set({
      alertCount: OVERDUE_ALERT_COUNT,
      deadlineAt: new Date(now - OVERDUE_BY_HOURS * MILLISECONDS_PER_HOUR),
      lastAlertAt: new Date(now - LAST_ALERT_HOURS_AGO * MILLISECONDS_PER_HOUR),
      status: 'overdue',
    })
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.id, replyId),
      ),
    )
  await database.db.insert(occurrenceContractorReplyEvents).values({
    actorKind: 'system',
    companyId,
    fromStatus: 'awaiting_contractor',
    replyId,
    toStatus: 'overdue',
  })
}
