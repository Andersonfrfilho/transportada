/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T5: a resposta automática à contratante. Quando o documento conferido é entregue sozinho ao motorista e o tipo
 * escolheu uma resposta rápida da contratante (`acknowledgementQuickReplyId` na cópia da configuração), o texto dela sai por
 * e-mail na thread da ocorrência, para quem respondeu. No máximo uma por conversa: a chave da linha em
 * `occurrence_contractor_reply_deliveries` é a conversa, não o retorno. Resposta rápida apagada ou desativada não envia.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o contrato
 * `contractor-reply-parity.contract.ts` do worker compara os dois arquivos.
 * Falha do envio nunca desfaz o retorno nem a entrega: tudo roda num savepoint e o erro vira uma linha `failed`.
 * Nenhum log aqui: endereço e texto nunca saem do banco.
 */
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

export type ContractorReplyAcknowledgementRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type QueueContractorReplyAcknowledgementResult =
  | { readonly kind: 'already_queued' }
  | { readonly kind: 'failed'; readonly reason: 'send_failed' }
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'queued' }

type Row = Record<string, unknown>

const TARGET = 'contractor_acknowledgement'
const SAVEPOINT = 'contractor_acknowledgement'
const ADDRESS_MAX_LENGTH = 254
const UNSAFE_ADDRESS_CHARACTERS = /[\r\n,;<>]/u
const WHITESPACE_RUN = /\s+/gu
const REPLY_PREFIX = /^re:/iu
const SUBJECT_MAX_LENGTH = 200

async function rowsOf(
  runner: ContractorReplyAcknowledgementRunner,
  query: SQL,
): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

function textList(row: Row | undefined, key: string): readonly string[] {
  const value = row?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** Mesma regra de `resolveCompanyDisplayName` da API, repetida porque este arquivo vive idêntico nas duas apps. */
function chosenCarrierName(input: {
  displayNameMode: null | string
  legalName: string
  tradeName: string
}): string {
  const legalName = input.legalName.trim()
  const tradeName = input.tradeName.trim()
  if (input.displayNameMode === 'legal_name') return legalName === '' ? tradeName : legalName
  return tradeName === '' ? legalName : tradeName
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseAddress(raw: null | string): null | string {
  const address = (raw ?? '').trim()
  if (address === '' || address.length > ADDRESS_MAX_LENGTH) return null
  if (UNSAFE_ADDRESS_CHARACTERS.test(address)) return null
  return z.string().email().safeParse(address).success ? address : null
}

function replySubject(subject: null | string): string {
  const base = (subject ?? '').replace(WHITESPACE_RUN, ' ').trim()
  const prefixed = REPLY_PREFIX.test(base) ? base : `Re: ${base}`.trim()
  return prefixed.slice(0, SUBJECT_MAX_LENGTH)
}

function buildMail(params: { readonly body: string; readonly carrierName: string }) {
  const signature = params.carrierName.trim()
  const paragraphs = params.body
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
  const html = [
    ...paragraphs,
    ...(signature === '' ? [] : [`<p>--<br>${escapeHtml(signature)}</p>`]),
  ].join('\n')
  return { html, text: signature === '' ? params.body : `${params.body}\n\n--\n${signature}` }
}

function readQuickReplyId(config: unknown): null | string {
  if (typeof config !== 'object' || config === null) return null
  const value = (config as Record<string, unknown>).acknowledgementQuickReplyId
  return typeof value === 'string' && value !== '' ? value : null
}

/** Quem respondeu (o remetente do e-mail); sem ele, os contatos do último e-mail da ocorrência à contratante. */
async function findRecipients(
  runner: ContractorReplyAcknowledgementRunner,
  params: {
    readonly companyId: string
    readonly replyMessageId: null | string
    readonly threadId: string
  },
): Promise<readonly string[]> {
  if (params.replyMessageId !== null) {
    const [reply] = await rowsOf(
      runner,
      sql`select sender_address from occurrence_conversation_messages
          where company_id = ${params.companyId}::uuid and id = ${params.replyMessageId}::uuid
            and channel = 'email' and direction = 'inbound'`,
    )
    const sender = parseAddress(text(reply, 'sender_address'))
    if (sender !== null) return [sender]
  }
  const [outbound] = await rowsOf(
    runner,
    sql`select to_addresses from contractor_mail_messages message
        where message.company_id = ${params.companyId}::uuid and message.thread_id = ${params.threadId}::uuid
          and message.direction = 'outbound'
          and not exists (
            select 1 from occurrence_contractor_reply_deliveries delivery
            where delivery.company_id = message.company_id and delivery.mail_message_id = message.id
          )
        order by message.created_at desc, message.id desc
        limit 1`,
  )
  return textList(outbound, 'to_addresses').flatMap((address) => parseAddress(address) ?? [])
}

async function queue(
  runner: ContractorReplyAcknowledgementRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyAcknowledgementResult> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select config, conversation_id, occurrence_id, reply_attachment_id, reply_message_id
        from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid
        for update`,
  )
  const quickReplyId = readQuickReplyId(reply?.config)
  const conversationId = text(reply, 'conversation_id')
  const occurrenceId = text(reply, 'occurrence_id')
  if (quickReplyId === null || conversationId === null || occurrenceId === null)
    return { kind: 'not_applicable' }

  const idempotencyKey = `${TARGET}:${conversationId}`
  const [existing] = await rowsOf(
    runner,
    sql`select id from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
  )
  if (existing !== undefined) return { kind: 'already_queued' }

  const [quickReply] = await rowsOf(
    runner,
    sql`select body_text from company_quick_replies
        where company_id = ${companyId}::uuid and id = ${quickReplyId}::uuid
          and audience = 'contractor' and active`,
  )
  const body = (text(quickReply, 'body_text') ?? '').trim()
  if (body === '') return { kind: 'not_applicable' }

  const record = async (outcome: {
    readonly mailMessageId: null | string
    readonly status: 'failed' | 'queued'
  }) => {
    await rowsOf(
      runner,
      sql`insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, reason, attachment_id, mail_message_id, actor_user_id,
             idempotency_key)
          values (${companyId}::uuid, ${replyId}::uuid, ${TARGET}, 'automatic', ${outcome.status},
                  ${outcome.status === 'failed' ? 'send_failed' : null}, ${text(reply, 'reply_attachment_id')}::uuid,
                  ${outcome.mailMessageId}::uuid, null, ${idempotencyKey})`,
    )
  }

  const [settings] = await rowsOf(
    runner,
    sql`select sender_address from contractor_mail_settings
        where company_id = ${companyId}::uuid and sending_verified_at is not null`,
  )
  const [thread] = await rowsOf(
    runner,
    sql`select thread.id,
               (select message.subject from contractor_mail_messages message
                where message.company_id = thread.company_id and message.thread_id = thread.id
                order by message.created_at desc, message.id desc limit 1) as subject
        from contractor_mail_threads thread
        where thread.company_id = ${companyId}::uuid and thread.subject_type = 'document_occurrence'
          and thread.subject_id = ${occurrenceId}::uuid`,
  )
  const senderAddress = text(settings, 'sender_address')
  const threadId = text(thread, 'id')
  const recipients =
    threadId === null
      ? []
      : await findRecipients(runner, {
          companyId,
          replyMessageId: text(reply, 'reply_message_id'),
          threadId,
        })
  if (senderAddress === null || threadId === null || recipients.length === 0) {
    await record({ mailMessageId: null, status: 'failed' })
    return { kind: 'failed', reason: 'send_failed' }
  }

  const [carrier] = await rowsOf(
    runner,
    sql`select trade_name, legal_name, display_name_mode from company_fiscal_profiles where company_id = ${companyId}::uuid`,
  )
  const mail = buildMail({
    body,
    carrierName: chosenCarrierName({
      displayNameMode: text(carrier, 'display_name_mode'),
      legalName: text(carrier, 'legal_name') ?? '',
      tradeName: text(carrier, 'trade_name') ?? '',
    }),
  })
  const [message] = await rowsOf(
    runner,
    sql`insert into contractor_mail_messages
          (company_id, thread_id, direction, from_address, subject, to_addresses, body_text, body_html, delivery_status)
        values (${companyId}::uuid, ${threadId}::uuid, 'outbound', ${senderAddress}, ${replySubject(text(thread, 'subject'))},
                ARRAY[${sql.join(
                  recipients.map((address) => sql`${address}`),
                  sql`, `,
                )}]::text[], ${mail.text}, ${mail.html}, 'queued')
        returning id`,
  )
  const messageId = text(message, 'id')
  if (messageId === null) throw new Error('CONTRACTOR_REPLY_ACKNOWLEDGEMENT_NOT_PERSISTED')
  await rowsOf(
    runner,
    sql`insert into contractor_mail_outbox (company_id, correlation_id, event_type, message_id, payload)
        values (${companyId}::uuid, ${`occurrence-contractor-acknowledgement:${replyId}`}, 'message.send.requested',
                ${messageId}::uuid, '{}'::jsonb)`,
  )
  await rowsOf(
    runner,
    sql`insert into occurrence_conversation_messages
          (company_id, conversation_id, channel, direction, automatic, body_text, mail_message_id, status, status_times)
        values (${companyId}::uuid, ${conversationId}::uuid, 'email', 'outbound', true, ${body}, ${messageId}::uuid,
                'queued', jsonb_build_object('queued', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))`,
  )
  await record({ mailMessageId: messageId, status: 'queued' })
  return { kind: 'queued' }
}

/** Um savepoint por tentativa: o que falhar desfaz só a própria escrita, nunca o que veio antes na transação. */
async function runIsolated<TResult>(
  runner: ContractorReplyAcknowledgementRunner,
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

async function recordFailure(
  runner: ContractorReplyAcknowledgementRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<void> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select conversation_id, reply_attachment_id from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid`,
  )
  const conversationId = text(reply, 'conversation_id')
  if (conversationId === null) return
  await rowsOf(
    runner,
    sql`insert into occurrence_contractor_reply_deliveries
          (company_id, reply_id, target, trigger, status, reason, attachment_id, actor_user_id, idempotency_key)
        values (${companyId}::uuid, ${replyId}::uuid, ${TARGET}, 'automatic', 'failed', 'send_failed',
                ${text(reply, 'reply_attachment_id')}::uuid, null, ${`${TARGET}:${conversationId}`})
        on conflict do nothing`,
  )
}

/** Chamada logo depois da entrega automática ao motorista, na mesma transação. */
export async function queueContractorReplyAcknowledgement(
  runner: ContractorReplyAcknowledgementRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyAcknowledgementResult> {
  const attempt = await runIsolated(runner, () => queue(runner, params))
  if (attempt.ok) return attempt.value
  await runIsolated(runner, () => recordFailure(runner, params))
  return { kind: 'failed', reason: 'send_failed' }
}
