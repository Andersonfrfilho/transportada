/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O arquivo que a contratante mandou na conversa vai ao motorista mesmo quando o tipo da ocorrência não abre
 * retorno (spec 248 pressupunha um): sem retorno não há texto do tipo nem linha de entrega, então a mensagem
 * sai com o anexo e o texto que o caso de uso montou ("Segue a requisição: <tipo>") — o **mesmo objeto do bucket**, como no caminho do retorno. Idempotente por anexo pela
 * `client_message_id` da mensagem na conversa do motorista.
 *
 * Só da API: o worker entrega apenas pelo retorno (`contractor-reply-driver-delivery.support.ts`, que tem
 * paridade com o worker e por isso não é tocado aqui). Nenhum log: anexo e destinatário não saem do banco.
 */
import { sql, type SQL } from 'drizzle-orm'

import type {
  ContractorReplyDeliveryRunner,
  DeliverContractorReplyToDriverResult,
} from './contractor-reply-driver-delivery.support.js'

export type DeliverConversationAttachmentToDriverParams = {
  readonly actorUserId: string
  readonly attachmentId: string
  /** O texto da mensagem que leva o arquivo; vazio é só o arquivo. */
  readonly bodyText: string
  readonly companyId: string
  readonly now: Date
  readonly occurrenceId: string
}

type Row = Record<string, unknown>

async function rowsOf(runner: ContractorReplyDeliveryRunner, query: SQL): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

export function conversationAttachmentDriverMessageKey(attachmentId: string): string {
  return `driver_app_chat:attachment:${attachmentId}`
}

export async function deliverConversationAttachmentToDriver(
  runner: ContractorReplyDeliveryRunner,
  params: DeliverConversationAttachmentToDriverParams,
): Promise<DeliverContractorReplyToDriverResult> {
  const { attachmentId, companyId, occurrenceId } = params
  const [source] = await rowsOf(
    runner,
    sql`select conversation.occurrence_kind
        from occurrence_conversation_attachments attachment
        join occurrence_conversation_messages message
          on message.company_id = attachment.company_id and message.id = attachment.message_id
        join occurrence_conversations conversation
          on conversation.company_id = message.company_id and conversation.id = message.conversation_id
        where attachment.company_id = ${companyId}::uuid
          and attachment.id = ${attachmentId}::uuid
          and conversation.occurrence_id = ${occurrenceId}::uuid
          and conversation.participant = 'contractor'`,
  )
  const occurrenceKind = text(source, 'occurrence_kind')
  if (occurrenceKind === null) return { kind: 'skipped', reason: 'attachment_not_found' }

  // Mesmo motorista que o caminho do retorno resolve: o primeiro da tripulação, com conta ativa.
  const [driver] = await rowsOf(
    runner,
    sql`select membership.user_id as driver_user_id
        from (
          select document.trip_id
            from trip_document_occurrences occurrence
            join trip_documents document
              on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
           where occurrence.company_id = ${companyId}::uuid and occurrence.id = ${occurrenceId}::uuid
             and ${occurrenceKind} = 'document'
          union all
          select stop.trip_id
            from trip_stop_occurrences occurrence
            join trip_stops stop
              on stop.company_id = occurrence.company_id and stop.id = occurrence.stop_id
           where occurrence.company_id = ${companyId}::uuid and occurrence.id = ${occurrenceId}::uuid
             and ${occurrenceKind} = 'stop'
        ) trip
        join trip_drivers crew
          on crew.company_id = ${companyId}::uuid and crew.trip_id = trip.trip_id and crew.position = 1
        join fleet_drivers driver
          on driver.company_id = crew.company_id and driver.id = crew.driver_id
        join user_company_memberships membership
          on membership.company_id = driver.company_id and membership.id = driver.membership_id
         and membership.status = 'active'
        limit 1`,
  )
  const driverUserId = text(driver, 'driver_user_id')
  if (driverUserId === null) return { kind: 'skipped', reason: 'driver_without_account' }

  const [conversation] = await rowsOf(
    runner,
    sql`insert into occurrence_conversations (company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
        values (${companyId}::uuid, ${occurrenceKind}, ${occurrenceId}::uuid, 'driver', ${driverUserId}::uuid)
        on conflict (company_id, occurrence_kind, occurrence_id, participant)
        do update set driver_user_id = excluded.driver_user_id
        returning id, protocol`,
  )
  const conversationId = text(conversation, 'id') ?? ''
  const queuedAt = params.now.toISOString()
  const [message] = await rowsOf(
    runner,
    sql`insert into occurrence_conversation_messages
          (company_id, conversation_id, channel, direction, author_user_id, automatic, body_text,
           status, status_times, client_message_id, created_at)
        values (${companyId}::uuid, ${conversationId}::uuid, 'app', 'outbound', ${params.actorUserId}::uuid,
                false, ${params.bodyText}, 'queued', ${JSON.stringify({ queued: queuedAt })}::jsonb,
                ${conversationAttachmentDriverMessageKey(attachmentId)}, ${queuedAt}::timestamptz)
        on conflict (company_id, conversation_id, direction, client_message_id)
          where client_message_id is not null
        do nothing
        returning id`,
  )
  const driverMessageId = text(message, 'id')
  if (driverMessageId === null) return { kind: 'already_delivered' }

  await rowsOf(
    runner,
    sql`insert into occurrence_conversation_attachments
          (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name, duration_ms)
        select source.company_id, ${driverMessageId}::uuid, source.stored_object_id, source.sha256,
               source.size_bytes, source.content_type, source.file_name, source.duration_ms
          from occurrence_conversation_attachments source
         where source.company_id = ${companyId}::uuid and source.id = ${attachmentId}::uuid`,
  )

  return {
    conversationId,
    driverMessageId,
    driverUserId,
    kind: 'delivered',
    occurrenceId,
    protocol: text(conversation, 'protocol') ?? '',
  }
}
