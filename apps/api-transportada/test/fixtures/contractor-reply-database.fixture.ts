/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7: o retorno da contratante já aberto e com a resposta (um PDF) recebida, contra Postgres
 * real — o ponto de partida dos testes que levam o boleto adiante.
 */
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  nfeDocuments,
  occurrenceContractorReplies,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  storedObjects,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { applyContractorReplyToMessage } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-contractor-reply.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { createOccurrenceMailUseCase } from './occurrence-conversation-database.fixture.js'
import type { Seeded } from './occurrence-conversation-database.fixture.js'
import type { TestDatabase } from './trip-field-office-database.fixture.js'

export const FORWARD_EMAIL_SUBJECT = 'Boleto com novo vencimento'
export const FORWARD_EMAIL_BODY = 'Segue o boleto prorrogado.'

export type ForwardModes = {
  readonly informed: 'manual' | 'off'
  readonly note: 'automatic' | 'manual' | 'off'
  /** Padrão: com aprovação do operador. */
  readonly replyMode?: 'forward_after_approval' | 'forward_automatic'
}

/** Abre o retorno pelo envio automático real; o tipo já carrega a configuração do encaminhamento. */
export async function openReplyWithForward(
  database: TestDatabase,
  seeded: Seeded,
  forward: ForwardModes,
): Promise<string> {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: forward.replyMode ?? 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
      forwardToInformedEmail: forward.informed,
      forwardToNoteRecipient: forward.note,
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  /** Spec 286 T9: o texto do e-mail sai do modelo escolhido no canal do tipo, não do texto antigo. */
  const templateKey = `occurrence.client-reply.${occurrence?.typeId ?? ''}`
  await database.db.execute(sql`
    insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
    values (${companyId}, ${templateKey}, 'email', 'pt-BR', 1, ${FORWARD_EMAIL_SUBJECT}, ${FORWARD_EMAIL_BODY}, true)`)
  /** Só semeia o e-mail automático quando o teste ainda não escolheu o canal: o teste pode trazer o modo dele. */
  const [existingEmail] = await database.db.execute(sql`
    select 1 from company_occurrence_type_client_channels
    where company_id = ${companyId} and occurrence_type_id = ${occurrence?.typeId ?? ''} and channel = 'email'`)
  if (existingEmail === undefined) {
    await database.db.execute(sql`
      insert into company_occurrence_type_client_channels (company_id, occurrence_type_id, channel, enabled, send_mode, template_key)
      values (${companyId}, ${occurrence?.typeId ?? ''}, 'email', true, 'automatic', ${templateKey})`)
  }
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({
    companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
  })
  const [reply] = await database.db
    .select({ conversationId: occurrenceContractorReplies.conversationId })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  if (reply === undefined) throw new Error('EXPECTED_OPEN_REPLY')
  return reply.conversationId
}

/** A resposta da contratante com um PDF; devolve o anexo e deixa o retorno em `awaiting_operator`. */
export async function receivePdfReply(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly conversationId: string
    readonly sizeBytes?: number
  },
): Promise<{ readonly attachmentId: string; readonly messageId: string }> {
  const [message] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: 'Segue o boleto.',
      channel: 'email',
      companyId: input.companyId,
      conversationId: input.conversationId,
      direction: 'inbound',
      senderAddress: 'compras@alfa.example.test',
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (message === undefined) throw new Error('EXPECTED_MESSAGE')
  const [object] = await database.db
    .insert(storedObjects)
    .values({
      bucket: 'bucket-privado',
      companyId: input.companyId,
      mimeType: 'application/pdf',
      objectKey: `occurrence-conversations/${crypto.randomUUID()}`,
      provider: 's3',
      purpose: 'occurrence_conversation_attachment',
      sha256: 'b'.repeat(64),
      sizeBytes: 12n,
      status: 'final',
    })
    .returning({ id: storedObjects.id })
  const [attachment] = await database.db
    .insert(occurrenceConversationAttachments)
    .values({
      companyId: input.companyId,
      contentType: 'application/pdf',
      fileName: 'boleto.pdf',
      messageId: message.id,
      sha256: 'b'.repeat(64),
      sizeBytes: input.sizeBytes ?? 12,
      storedObjectId: object?.id ?? '',
    })
    .returning({ id: occurrenceConversationAttachments.id })
  await database.db.transaction((transaction) =>
    applyContractorReplyToMessage(transaction, {
      companyId: input.companyId,
      conversationId: input.conversationId,
      messageId: message.id,
      now: new Date(),
    }),
  )
  return { attachmentId: attachment?.id ?? '', messageId: message.id }
}

export async function setNoteRecipientEmail(
  database: TestDatabase,
  companyId: string,
  recipientEmail: null | string,
): Promise<void> {
  await database.db
    .update(nfeDocuments)
    .set({ recipientEmail })
    .where(eq(nfeDocuments.companyId, companyId))
}

/**
 * Spec 286 T9: o texto do boleto no canal sai do modelo escolhido no tipo, não do texto antigo. Semeia o modelo
 * do canal e a linha de canal ligada a ele, como o cadastro faz.
 */
export async function seedContractorReplyChannelTemplate(
  database: TestDatabase,
  seeded: Seeded,
  channel: 'email' | 'whatsapp',
  body: string,
): Promise<void> {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  const typeId = occurrence?.typeId ?? ''
  const templateKey = `occurrence.client-reply.${typeId}`
  await database.db.execute(sql`
    insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
    values (${companyId}, ${templateKey}, ${channel}, 'pt-BR', 1, '', ${body}, true)`)
  await database.db.execute(sql`
    insert into company_occurrence_type_client_channels (company_id, occurrence_type_id, channel, enabled, send_mode, template_key)
    values (${companyId}, ${typeId}, ${channel}, true, 'automatic', ${templateKey})`)
}
