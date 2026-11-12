/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF7/RF9 (T4.6): leva o anexo da resposta da contratante à conversa do **motorista**, no chat do
 * app, com o texto do tipo e o **mesmo objeto do bucket** (uma linha nova de anexo, nenhuma cópia de bytes).
 * Idempotente por `(retorno, anexo)`: a mesma chave de entrega nunca manda duas vezes.
 *
 * Spec 276 T3b: com `resolveOnDelivery` na cópia da configuração, a primeira entrega também deixa a ocorrência
 * solucionada (evento `system` do andamento da 266, causado pelo retorno), na mesma transação. Ocorrência já
 * solucionada ou cancelada fica como está.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-driver-delivery-parity.contract.ts` do worker compara os dois arquivos.
 * Nenhum log aqui: anexo, texto e destinatário nunca saem do banco.
 */
import { sql, type SQL } from 'drizzle-orm'

export type ContractorReplyDeliveryRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type DeliverContractorReplyToDriverParams = {
  readonly actorUserId: null | string
  /** Ausente é o anexo aceito do retorno; o operador pode escolher outro da conversa da contratante (RF9). */
  readonly attachmentId?: string
  readonly companyId: string
  readonly now: Date
  readonly replyId: string
  readonly trigger: 'automatic' | 'operator'
}

export type DeliverContractorReplyToDriverResult =
  | {
      readonly kind: 'delivered'
      readonly conversationId: string
      readonly driverMessageId: string
      readonly driverUserId: string
      readonly occurrenceId: string
      readonly protocol: string
      /** Spec 276 T3b: esta entrega deixou a ocorrência solucionada (ausente: o caminho não resolve). */
      readonly resolvedOccurrence?: boolean
    }
  | { readonly kind: 'already_delivered' }
  | {
      readonly kind: 'skipped'
      readonly reason: 'attachment_not_found' | 'driver_without_account' | 'reply_not_found'
    }

type Row = Record<string, unknown>

async function rowsOf(runner: ContractorReplyDeliveryRunner, query: SQL): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

function textOf(row: Row | undefined, key: string): string {
  return text(row, key) ?? ''
}

function resolveBodyText(config: unknown): string {
  if (typeof config !== 'object' || config === null) return ''
  const template = (config as Record<string, unknown>).driverReplyTemplate
  return typeof template === 'string' ? template.trim() : ''
}

function resolvesOnDelivery(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) return false
  return (config as Record<string, unknown>).resolveOnDelivery === true
}

const DRIVER_TARGET = 'driver_app_chat'

/**
 * Trava a ocorrência (`FOR NO KEY UPDATE`, o molde da 266) e lê o estado depois do lock: o último evento do
 * andamento por `seq`. Grava `resolved` do sistema só se ela segue aberta e não cancelada.
 */
async function resolveOccurrenceOnDelivery(
  runner: ContractorReplyDeliveryRunner,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: string
    readonly replyId: string
  },
): Promise<boolean> {
  const { companyId, occurrenceId, replyId } = params
  const isDocument = params.occurrenceKind === 'document'
  const [occurrence] = await rowsOf(
    runner,
    isDocument
      ? sql`select cancelled_at is not null as cancelled from trip_document_occurrences
            where company_id = ${companyId}::uuid and id = ${occurrenceId}::uuid
            for no key update`
      : sql`select false as cancelled from trip_stop_occurrences
            where company_id = ${companyId}::uuid and id = ${occurrenceId}::uuid
            for no key update`,
  )
  if (occurrence === undefined || occurrence.cancelled === true) return false
  const [latest] = await rowsOf(
    runner,
    sql`select kind from trip_occurrence_resolution_events
        where company_id = ${companyId}::uuid
          and ${isDocument ? sql`document_occurrence_id` : sql`stop_occurrence_id`} = ${occurrenceId}::uuid
        order by seq desc
        limit 1`,
  )
  if (text(latest, 'kind') === 'resolved') return false
  await rowsOf(
    runner,
    sql`insert into trip_occurrence_resolution_events
          (company_id, document_occurrence_id, stop_occurrence_id, kind, actor_kind, contractor_reply_id)
        values (${companyId}::uuid, ${isDocument ? occurrenceId : null}::uuid,
                ${isDocument ? null : occurrenceId}::uuid, 'resolved', 'system', ${replyId}::uuid)
        on conflict do nothing`,
  )
  return true
}

export async function deliverContractorReplyToDriver(
  runner: ContractorReplyDeliveryRunner,
  params: DeliverContractorReplyToDriverParams,
): Promise<DeliverContractorReplyToDriverResult> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select id, status, config, occurrence_id, conversation_id, reply_attachment_id
        from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid
        for update`,
  )
  if (reply === undefined) return { kind: 'skipped', reason: 'reply_not_found' }

  const occurrenceId = textOf(reply, 'occurrence_id')
  const attachmentId = params.attachmentId ?? text(reply, 'reply_attachment_id')
  if (attachmentId === null) return { kind: 'skipped', reason: 'attachment_not_found' }

  const idempotencyKey = `${DRIVER_TARGET}:${replyId}:${attachmentId}`
  const [existing] = await rowsOf(
    runner,
    sql`select id from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
  )
  if (existing !== undefined) return { kind: 'already_delivered' }

  const [attachment] = await rowsOf(
    runner,
    sql`select attachment.id
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
  if (attachment === undefined) return { kind: 'skipped', reason: 'attachment_not_found' }

  const [source] = await rowsOf(
    runner,
    sql`select occurrence_kind from occurrence_conversations
        where company_id = ${companyId}::uuid and id = ${textOf(reply, 'conversation_id')}::uuid`,
  )
  const occurrenceKind = textOf(source, 'occurrence_kind')

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
  if (driverUserId === null) {
    await rowsOf(
      runner,
      sql`insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, reason, attachment_id, actor_user_id, idempotency_key)
          values (${companyId}::uuid, ${replyId}::uuid, ${DRIVER_TARGET}, ${params.trigger}, 'skipped',
                  'driver_without_account', ${attachmentId}::uuid, ${params.actorUserId}::uuid, ${idempotencyKey})
          on conflict do nothing`,
    )
    return { kind: 'skipped', reason: 'driver_without_account' }
  }

  const [conversation] = await rowsOf(
    runner,
    sql`insert into occurrence_conversations (company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
        values (${companyId}::uuid, ${occurrenceKind}, ${occurrenceId}::uuid, 'driver', ${driverUserId}::uuid)
        on conflict (company_id, occurrence_kind, occurrence_id, participant)
        do update set driver_user_id = excluded.driver_user_id
        returning id, protocol`,
  )
  const conversationId = textOf(conversation, 'id')
  const queuedAt = params.now.toISOString()
  const isAutomatic = params.trigger === 'automatic'
  const [message] = await rowsOf(
    runner,
    sql`insert into occurrence_conversation_messages
          (company_id, conversation_id, channel, direction, author_user_id, automatic, body_text,
           status, status_times, client_message_id, created_at)
        values (${companyId}::uuid, ${conversationId}::uuid, 'app', 'outbound', ${params.actorUserId}::uuid,
                ${isAutomatic}, ${resolveBodyText(reply.config)}, 'queued',
                ${JSON.stringify({ queued: queuedAt })}::jsonb, ${idempotencyKey}, ${queuedAt}::timestamptz)
        returning id`,
  )
  const driverMessageId = textOf(message, 'id')

  await rowsOf(
    runner,
    sql`insert into occurrence_conversation_attachments
          (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name, duration_ms)
        select source.company_id, ${driverMessageId}::uuid, source.stored_object_id, source.sha256,
               source.size_bytes, source.content_type, source.file_name, source.duration_ms
          from occurrence_conversation_attachments source
         where source.company_id = ${companyId}::uuid and source.id = ${attachmentId}::uuid`,
  )

  const [delivery] = await rowsOf(
    runner,
    sql`insert into occurrence_contractor_reply_deliveries
          (company_id, reply_id, target, trigger, status, attachment_id, driver_message_id, actor_user_id,
           idempotency_key, sent_at)
        values (${companyId}::uuid, ${replyId}::uuid, ${DRIVER_TARGET}, ${params.trigger}, 'sent',
                ${attachmentId}::uuid, ${driverMessageId}::uuid, ${params.actorUserId}::uuid,
                ${idempotencyKey}, ${queuedAt}::timestamptz)
        returning id`,
  )

  const fromStatus = textOf(reply, 'status')
  await rowsOf(
    runner,
    sql`update occurrence_contractor_replies
        set status = 'delivered', reason = null, updated_at = ${queuedAt}::timestamptz
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid and status <> 'delivered'`,
  )
  let resolvedOccurrence = false
  if (fromStatus !== 'delivered') {
    await rowsOf(
      runner,
      sql`insert into occurrence_contractor_reply_events
            (company_id, reply_id, delivery_id, from_status, to_status, actor_kind, actor_user_id)
          values (${companyId}::uuid, ${replyId}::uuid, ${textOf(delivery, 'id')}::uuid, ${fromStatus},
                  'delivered', ${isAutomatic ? 'system' : 'user'}, ${params.actorUserId}::uuid)`,
    )
    if (resolvesOnDelivery(reply.config)) {
      resolvedOccurrence = await resolveOccurrenceOnDelivery(runner, {
        companyId,
        occurrenceId,
        occurrenceKind,
        replyId,
      })
    }
  }

  return {
    conversationId,
    driverMessageId,
    driverUserId,
    kind: 'delivered',
    occurrenceId,
    protocol: textOf(conversation, 'protocol'),
    resolvedOccurrence,
  }
}
