/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF10 (T4.7): o boleto aceito da contratante sai sozinho ao e-mail do cliente da nota, quando o tipo
 * liga `forward_to_note_recipient = automatic`. Mesmo trilho do envio manual (`forward-contractor-reply-by-email`):
 * mensagem da 143 presa à thread da ocorrência, sem token de resposta, evento no outbox e linha em
 * `occurrence_contractor_reply_deliveries`. Idempotente por `(retorno, anexo)`.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-parity.contract.ts` do worker compara os dois arquivos.
 * Falha do envio nunca desfaz o retorno: tudo roda num savepoint e o erro vira uma linha `failed`.
 * Nenhum log aqui: endereço, texto e anexo nunca saem do banco.
 *
 * Spec 286 T3: o texto é o modelo `email` do módulo de notificação escolhido no tipo (`contractor-reply-client-template`);
 * sem modelo utilizável nada sai e fica `skipped / template_missing`.
 */
import { createHash } from 'node:crypto'

import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { CONVERSATION_ATTACHMENT_LIMITS } from '../domain/conversation-attachment.policy.js'
import { buildContractorReplyLayoutMail } from './contractor-reply-client-email-layout.support.js'
import { resolveContractorReplyClientTexts } from './contractor-reply-client-template.support.js'

export type ContractorReplyNoteRecipientRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type QueueContractorReplyToNoteRecipientResult =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'already_queued' }
  | { readonly kind: 'queued' }
  | {
      readonly kind: 'failed' | 'skipped'
      readonly reason:
        | 'attachment_too_large_for_email'
        | 'note_without_recipient_email'
        | 'send_failed'
        | 'template_missing'
    }

type Row = Record<string, unknown>

const TARGET = 'note_recipient_email'
const SAVEPOINT = 'note_recipient_forward'
const ADDRESS_MAX_LENGTH = 254
const UNSAFE_ADDRESS_CHARACTERS = /[\r\n,;<>]/u
const DIGEST_LENGTH = 32

async function rowsOf(
  runner: ContractorReplyNoteRecipientRunner,
  query: SQL,
): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

/** Mesma regra de `resolveCompanyDisplayName` da API, repetida porque este arquivo vive idêntico nas duas apps. */
function parseAddress(raw: null | string): null | string {
  const address = (raw ?? '').trim()
  if (address === '' || address.length > ADDRESS_MAX_LENGTH) return null
  if (UNSAFE_ADDRESS_CHARACTERS.test(address)) return null
  return z.string().email().safeParse(address).success ? address : null
}

function isAutomatic(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) return false
  return (config as Record<string, unknown>).forwardToNoteRecipient === 'automatic'
}

function deriveIdempotencyKey(params: {
  readonly attachmentId: string
  readonly replyId: string
}): string {
  const digest = createHash('sha256')
    .update(`${params.replyId}:automatic:${params.attachmentId}`)
    .digest('hex')
  return `${TARGET}:${digest.slice(0, DIGEST_LENGTH)}`
}

async function queue(
  runner: ContractorReplyNoteRecipientRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyToNoteRecipientResult> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select config, occurrence_id, reply_attachment_id
        from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid
        for update`,
  )
  const attachmentId = text(reply, 'reply_attachment_id')
  const occurrenceId = text(reply, 'occurrence_id')
  if (!isAutomatic(reply?.config) || attachmentId === null || occurrenceId === null)
    return { kind: 'not_applicable' }

  const idempotencyKey = deriveIdempotencyKey({ attachmentId, replyId })
  const [existing] = await rowsOf(
    runner,
    sql`select id from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
  )
  if (existing !== undefined) return { kind: 'already_queued' }

  const record = async (outcome: {
    readonly address: null | string
    readonly mailMessageId: null | string
    readonly reason: null | string
    readonly status: 'failed' | 'queued' | 'skipped'
  }) => {
    await rowsOf(
      runner,
      sql`insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, reason, attachment_id, address, mail_message_id,
             actor_user_id, idempotency_key)
          values (${companyId}::uuid, ${replyId}::uuid, ${TARGET}, 'automatic', ${outcome.status}, ${outcome.reason},
                  ${attachmentId}::uuid, ${outcome.address}, ${outcome.mailMessageId}::uuid, null, ${idempotencyKey})`,
    )
  }

  const resolved = await resolveContractorReplyClientTexts(runner, {
    channel: 'email',
    companyId,
    config: reply?.config,
    occurrenceId,
  })
  if (resolved.kind === 'template_missing') {
    await record({
      address: null,
      mailMessageId: null,
      reason: 'template_missing',
      status: 'skipped',
    })
    return { kind: 'skipped', reason: 'template_missing' }
  }
  const { texts } = resolved

  const [note] = await rowsOf(
    runner,
    sql`select nfe.recipient_email
        from trip_document_occurrences occurrence
        join trip_documents document
          on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
        join nfe_documents nfe
          on nfe.company_id = document.company_id and nfe.id = document.nfe_document_id
        where occurrence.company_id = ${companyId}::uuid and occurrence.id = ${occurrenceId}::uuid`,
  )
  const address = parseAddress(text(note, 'recipient_email'))
  if (address === null) {
    await record({
      address: null,
      mailMessageId: null,
      reason: 'note_without_recipient_email',
      status: 'skipped',
    })
    return { kind: 'skipped', reason: 'note_without_recipient_email' }
  }

  const [attachment] = await rowsOf(
    runner,
    sql`select size_bytes from occurrence_conversation_attachments
        where company_id = ${companyId}::uuid and id = ${attachmentId}::uuid`,
  )
  if (Number(attachment?.size_bytes ?? 0) > CONVERSATION_ATTACHMENT_LIMITS.email.document) {
    await record({
      address,
      mailMessageId: null,
      reason: 'attachment_too_large_for_email',
      status: 'failed',
    })
    return { kind: 'failed', reason: 'attachment_too_large_for_email' }
  }

  const [settings] = await rowsOf(
    runner,
    sql`select sender_address from contractor_mail_settings
        where company_id = ${companyId}::uuid and sending_verified_at is not null`,
  )
  const [thread] = await rowsOf(
    runner,
    sql`select id from contractor_mail_threads
        where company_id = ${companyId}::uuid and subject_type = 'document_occurrence'
          and subject_id = ${occurrenceId}::uuid`,
  )
  const senderAddress = text(settings, 'sender_address')
  const threadId = text(thread, 'id')
  if (senderAddress === null || threadId === null) {
    await record({ address, mailMessageId: null, reason: 'send_failed', status: 'failed' })
    return { kind: 'failed', reason: 'send_failed' }
  }

  const mail = await buildContractorReplyLayoutMail(runner, {
    body: texts.body,
    companyId,
    subject: texts.subject,
  })
  const [message] = await rowsOf(
    runner,
    sql`insert into contractor_mail_messages
          (company_id, thread_id, direction, from_address, subject, to_addresses, body_text, body_html,
           has_inline_logo, delivery_status)
        values (${companyId}::uuid, ${threadId}::uuid, 'outbound', ${senderAddress}, ${mail.subject},
                ARRAY[${address}]::text[], ${mail.text}, ${mail.html}, ${mail.hasInlineLogo}, 'queued')
        returning id`,
  )
  const messageId = text(message, 'id')
  if (messageId === null) throw new Error('CONTRACTOR_REPLY_NOTE_RECIPIENT_MESSAGE_NOT_PERSISTED')
  await rowsOf(
    runner,
    sql`insert into contractor_mail_outbox (company_id, correlation_id, event_type, message_id, payload)
        values (${companyId}::uuid, ${`occurrence-contractor-reply:${replyId}`}, 'message.send.requested',
                ${messageId}::uuid, '{}'::jsonb)`,
  )
  await record({ address, mailMessageId: messageId, reason: null, status: 'queued' })
  return { kind: 'queued' }
}

async function recordFailure(
  runner: ContractorReplyNoteRecipientRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<void> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select reply_attachment_id from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid`,
  )
  const attachmentId = text(reply, 'reply_attachment_id')
  if (attachmentId === null) return
  await rowsOf(
    runner,
    sql`insert into occurrence_contractor_reply_deliveries
          (company_id, reply_id, target, trigger, status, reason, attachment_id, actor_user_id, idempotency_key)
        values (${companyId}::uuid, ${replyId}::uuid, ${TARGET}, 'automatic', 'failed', 'send_failed',
                ${attachmentId}::uuid, null, ${deriveIdempotencyKey({ attachmentId, replyId })})
        on conflict do nothing`,
  )
}

/** Um savepoint por tentativa: o que falhar desfaz só a própria escrita, nunca o que veio antes na transação. */
async function runIsolated<TResult>(
  runner: ContractorReplyNoteRecipientRunner,
  operation: () => Promise<TResult>,
): Promise<{ readonly ok: false } | { readonly ok: true; readonly value: TResult }> {
  await runner.execute(sql.raw(`savepoint ${SAVEPOINT}`))
  try {
    const value = await operation()
    await runner.execute(sql.raw(`release savepoint ${SAVEPOINT}`))
    return { ok: true, value }
  } catch {
    await runner.execute(sql.raw(`rollback to savepoint ${SAVEPOINT}`))
    await runner.execute(sql.raw(`release savepoint ${SAVEPOINT}`))
    return { ok: false }
  }
}

/**
 * Falha do envio nunca desfaz o retorno recebido nem a entrega ao motorista da mesma transação: o erro volta o
 * savepoint e deixa uma linha `failed / send_failed` na linha do tempo.
 */
export async function queueContractorReplyToNoteRecipient(
  runner: ContractorReplyNoteRecipientRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyToNoteRecipientResult> {
  const attempt = await runIsolated(runner, () => queue(runner, params))
  if (attempt.ok) return attempt.value
  await runIsolated(runner, () => recordFailure(runner, params))
  return { kind: 'failed', reason: 'send_failed' }
}
