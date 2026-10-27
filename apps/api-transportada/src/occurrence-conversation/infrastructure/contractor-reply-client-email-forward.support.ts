/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF10 (T3c): o boleto aceito da contratante sai sozinho aos e-mails do cadastro do cliente de entrega, quando
 * o tipo da ocorrência liga `client_email_send_mode = automatic` (e `client_email_type <> off`, que diz qual tipo de
 * e-mail do cliente usar). Mesmo trilho do envio manual do alvo `client_boleto_emails`
 * (`forward-contractor-reply-by-email`): um e-mail por endereço, mensagem da 143 presa à thread da ocorrência, sem token
 * de resposta, evento no outbox e linha em `occurrence_contractor_reply_deliveries` com gatilho `automatic` e sem
 * usuário (o ator é o Sistema). A chave de cada entrega é a mesma do envio manual, por (retorno, anexo, endereço): o
 * botão depois não manda de novo ao mesmo endereço. Sem e-mail do tipo no cadastro, nada sai e fica uma linha
 * `skipped / client_without_email` para o operador ver.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-parity.contract.ts` do worker compara os dois arquivos.
 * Falha do envio nunca desfaz o retorno: tudo roda num savepoint e o erro vira uma linha `failed`.
 * Nenhum log aqui: endereço, texto e anexo nunca saem do banco.
 */
import { createHash } from 'node:crypto'

import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { CONVERSATION_ATTACHMENT_LIMITS } from '../domain/conversation-attachment.policy.js'
import {
  CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE,
  CONTRACTOR_REPLY_EMAIL_TARGETS,
} from '../../shared/occurrence-contractor-reply.constant.js'

export type ContractorReplyClientEmailRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type QueueContractorReplyToClientEmailsResult =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'skipped'; readonly reason: 'client_without_email' }
  | { readonly kind: 'failed'; readonly reason: 'send_failed' }
  | {
      readonly alreadyQueued: number
      readonly failed: number
      readonly kind: 'processed'
      readonly overLimit: number
      readonly queued: number
    }

type Row = Record<string, unknown>

const TARGET = 'client_boleto_emails'
const SAVEPOINT = 'client_email_forward'
const AUTOMATIC_MODE = 'automatic'
const OFF_TYPE = 'off'
const RECIPIENT_ROLE = 'recipient'
const COUNTED_STATUSES = ['queued', 'sent'] as const
const ADDRESS_MAX_LENGTH = 254
const UNSAFE_ADDRESS_CHARACTERS = /[\r\n,;<>]/u
const WHITESPACE_RUN = /\s+/gu
const DIGEST_LENGTH = 32

async function rowsOf(
  runner: ContractorReplyClientEmailRunner,
  query: SQL,
): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
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

function buildMail(params: {
  readonly body: string
  readonly carrierName: string
  readonly subject: string
}) {
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
  return {
    html,
    subject: params.subject.replace(WHITESPACE_RUN, ' ').trim(),
    text: signature === '' ? params.body : `${params.body}\n\n--\n${signature}`,
  }
}

/** O texto do e-mail da cópia do retorno (248): sem assunto ou corpo, o automático não sai (RF10). */
function readTexts(config: unknown): { readonly body: string; readonly subject: string } | null {
  if (typeof config !== 'object' || config === null) return null
  const fields = config as Record<string, unknown>
  const body = typeof fields.forwardEmailBody === 'string' ? fields.forwardEmailBody.trim() : ''
  const subject =
    typeof fields.forwardEmailSubject === 'string' ? fields.forwardEmailSubject.trim() : ''
  return body === '' || subject === '' ? null : { body, subject }
}

/** D3: a mesma chave do envio manual (`deriveClientDeliveryKey` do caso de uso) — um boleto, um endereço, uma vez. */
function deriveAddressKey(params: {
  readonly address: string
  readonly attachmentId: string
  readonly replyId: string
}): string {
  const digest = createHash('sha256')
    .update(`${params.replyId}:${params.attachmentId}:${params.address.toLowerCase()}`)
    .digest('hex')
  return `${TARGET}:${digest.slice(0, DIGEST_LENGTH)}`
}

/** A tentativa automática inteira (sem e-mail no cadastro, ou a falha dela): uma linha por (retorno, anexo). */
function deriveAttemptKey(params: {
  readonly attachmentId: string
  readonly replyId: string
}): string {
  const digest = createHash('sha256')
    .update(`${params.replyId}:${AUTOMATIC_MODE}:${params.attachmentId}`)
    .digest('hex')
  return `${TARGET}:${digest.slice(0, DIGEST_LENGTH)}`
}

function inList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

async function recordDelivery(
  runner: ContractorReplyClientEmailRunner,
  params: {
    readonly address: null | string
    readonly attachmentId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly mailMessageId: null | string
    readonly reason: null | string
    readonly replyId: string
    readonly status: 'failed' | 'queued' | 'skipped'
  },
): Promise<void> {
  await rowsOf(
    runner,
    sql`insert into occurrence_contractor_reply_deliveries
          (company_id, reply_id, target, trigger, status, reason, attachment_id, address, mail_message_id,
           actor_user_id, idempotency_key)
        values (${params.companyId}::uuid, ${params.replyId}::uuid, ${TARGET}, 'automatic', ${params.status},
                ${params.reason}, ${params.attachmentId}::uuid, ${params.address}, ${params.mailMessageId}::uuid, null,
                ${params.idempotencyKey})`,
  )
}

/** Os e-mails do tipo configurado no cadastro do cliente (o destinatário da nota), na ordem do cadastro. */
async function listClientAddresses(
  runner: ContractorReplyClientEmailRunner,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly purpose: string
  },
): Promise<readonly string[]> {
  const rows = await rowsOf(
    runner,
    sql`select email.address
        from trip_document_occurrences occurrence
        join trip_documents document
          on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
        join nfe_participants participant
          on participant.company_id = document.company_id and participant.document_id = document.nfe_document_id
         and participant.role = ${RECIPIENT_ROLE}
        join delivery_client_emails email
          on email.company_id = participant.company_id and email.tax_id = participant.tax_id
         and email.purpose = ${params.purpose}
        where occurrence.company_id = ${params.companyId}::uuid and occurrence.id = ${params.occurrenceId}::uuid
        order by email.created_at, email.id`,
  )
  const seen = new Set<string>()
  const addresses: string[] = []
  for (const row of rows) {
    const address = parseAddress(text(row, 'address'))
    if (address === null || seen.has(address.toLowerCase())) continue
    seen.add(address.toLowerCase())
    addresses.push(address)
  }
  return addresses
}

async function prepareMail(
  runner: ContractorReplyClientEmailRunner,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly texts: { readonly body: string; readonly subject: string }
  },
): Promise<null | {
  readonly html: string
  readonly senderAddress: string
  readonly subject: string
  readonly text: string
  readonly threadId: string
}> {
  const { companyId, occurrenceId, texts } = params
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
  if (senderAddress === null || threadId === null) return null
  const [carrier] = await rowsOf(
    runner,
    sql`select trade_name, legal_name, display_name_mode from company_fiscal_profiles where company_id = ${companyId}::uuid`,
  )
  const mail = buildMail({
    body: texts.body,
    carrierName: chosenCarrierName({
      displayNameMode: text(carrier, 'display_name_mode'),
      legalName: text(carrier, 'legal_name') ?? '',
      tradeName: text(carrier, 'trade_name') ?? '',
    }),
    subject: texts.subject,
  })
  return { ...mail, senderAddress, threadId }
}

async function queue(
  runner: ContractorReplyClientEmailRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyToClientEmailsResult> {
  const { companyId, replyId } = params
  const [reply] = await rowsOf(
    runner,
    sql`select config, occurrence_id, reply_attachment_id
        from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid
        for update`,
  )
  const texts = readTexts(reply?.config)
  const attachmentId = text(reply, 'reply_attachment_id')
  const occurrenceId = text(reply, 'occurrence_id')
  if (texts === null || attachmentId === null || occurrenceId === null)
    return { kind: 'not_applicable' }

  const [type] = await rowsOf(
    runner,
    sql`select occurrence_type.client_email_type, occurrence_type.client_email_send_mode
        from trip_document_occurrences occurrence
        join company_occurrence_types occurrence_type
          on occurrence_type.company_id = occurrence.company_id
         and occurrence_type.id = occurrence.occurrence_type_id
        where occurrence.company_id = ${companyId}::uuid and occurrence.id = ${occurrenceId}::uuid`,
  )
  const purpose = text(type, 'client_email_type')
  if (purpose === null || purpose === OFF_TYPE) return { kind: 'not_applicable' }
  if (text(type, 'client_email_send_mode') !== AUTOMATIC_MODE) return { kind: 'not_applicable' }

  const addresses = await listClientAddresses(runner, { companyId, occurrenceId, purpose })
  if (addresses.length === 0) {
    const idempotencyKey = deriveAttemptKey({ attachmentId, replyId })
    const [existing] = await rowsOf(
      runner,
      sql`select id from occurrence_contractor_reply_deliveries
          where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
    )
    if (existing === undefined) {
      await recordDelivery(runner, {
        address: null,
        attachmentId,
        companyId,
        idempotencyKey,
        mailMessageId: null,
        reason: 'client_without_email',
        replyId,
        status: 'skipped',
      })
    }
    return { kind: 'skipped', reason: 'client_without_email' }
  }

  const planned: { readonly address: string; readonly idempotencyKey: string }[] = []
  let alreadyQueued = 0
  for (const address of addresses) {
    const idempotencyKey = deriveAddressKey({ address, attachmentId, replyId })
    const [existing] = await rowsOf(
      runner,
      sql`select id from occurrence_contractor_reply_deliveries
          where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
    )
    if (existing === undefined) planned.push({ address, idempotencyKey })
    else alreadyQueued += 1
  }
  const tally = { alreadyQueued, failed: 0, overLimit: 0, queued: 0 }
  if (planned.length > 0)
    await send(runner, { attachmentId, companyId, occurrenceId, planned, replyId, tally, texts })
  return { kind: 'processed', ...tally }
}

type Tally = { alreadyQueued: number; failed: number; overLimit: number; queued: number }

async function send(
  runner: ContractorReplyClientEmailRunner,
  params: {
    readonly attachmentId: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly planned: readonly { readonly address: string; readonly idempotencyKey: string }[]
    readonly replyId: string
    readonly tally: Tally
    readonly texts: { readonly body: string; readonly subject: string }
  },
): Promise<void> {
  const { attachmentId, companyId, occurrenceId, planned, replyId, tally, texts } = params

  const [attachment] = await rowsOf(
    runner,
    sql`select size_bytes from occurrence_conversation_attachments
        where company_id = ${companyId}::uuid and id = ${attachmentId}::uuid`,
  )
  if (Number(attachment?.size_bytes ?? 0) > CONVERSATION_ATTACHMENT_LIMITS.email.document) {
    for (const item of planned) {
      await recordDelivery(runner, {
        address: item.address,
        attachmentId,
        companyId,
        idempotencyKey: item.idempotencyKey,
        mailMessageId: null,
        reason: 'attachment_too_large_for_email',
        replyId,
        status: 'failed',
      })
    }
    tally.failed = planned.length
    return
  }

  /** O teto por ocorrência da 248 vale também aqui: os primeiros do cadastro até ele, o resto fica para o botão. */
  const [counted] = await rowsOf(
    runner,
    sql`select count(*)::int as total from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and reply_id = ${replyId}::uuid
          and target in (${inList(CONTRACTOR_REPLY_EMAIL_TARGETS)})
          and status in (${inList(COUNTED_STATUSES)})`,
  )
  const remaining = Math.max(
    0,
    CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE - Number(counted?.total ?? 0),
  )
  const sending = planned.slice(0, remaining)
  tally.overLimit = planned.length - sending.length
  if (sending.length === 0) return

  const mail = await prepareMail(runner, { companyId, occurrenceId, texts })
  for (const item of sending) {
    if (mail === null) {
      await recordDelivery(runner, {
        address: item.address,
        attachmentId,
        companyId,
        idempotencyKey: item.idempotencyKey,
        mailMessageId: null,
        reason: 'send_failed',
        replyId,
        status: 'failed',
      })
      tally.failed += 1
      continue
    }
    const [message] = await rowsOf(
      runner,
      sql`insert into contractor_mail_messages
            (company_id, thread_id, direction, from_address, subject, to_addresses, body_text, body_html, delivery_status)
          values (${companyId}::uuid, ${mail.threadId}::uuid, 'outbound', ${mail.senderAddress}, ${mail.subject},
                  ARRAY[${item.address}]::text[], ${mail.text}, ${mail.html}, 'queued')
          returning id`,
    )
    const messageId = text(message, 'id')
    if (messageId === null) throw new Error('CONTRACTOR_REPLY_CLIENT_EMAIL_MESSAGE_NOT_PERSISTED')
    await rowsOf(
      runner,
      sql`insert into contractor_mail_outbox (company_id, correlation_id, event_type, message_id, payload)
          values (${companyId}::uuid, ${`occurrence-contractor-reply:${replyId}`}, 'message.send.requested',
                  ${messageId}::uuid, '{}'::jsonb)`,
    )
    await recordDelivery(runner, {
      address: item.address,
      attachmentId,
      companyId,
      idempotencyKey: item.idempotencyKey,
      mailMessageId: messageId,
      reason: null,
      replyId,
      status: 'queued',
    })
    tally.queued += 1
  }
}

async function recordFailure(
  runner: ContractorReplyClientEmailRunner,
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
                ${attachmentId}::uuid, null, ${deriveAttemptKey({ attachmentId, replyId })})
        on conflict do nothing`,
  )
}

/** Um savepoint por tentativa: o que falhar desfaz só a própria escrita, nunca o que veio antes na transação. */
async function runIsolated<TResult>(
  runner: ContractorReplyClientEmailRunner,
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
export async function queueContractorReplyToClientEmails(
  runner: ContractorReplyClientEmailRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<QueueContractorReplyToClientEmailsResult> {
  const attempt = await runIsolated(runner, () => queue(runner, params))
  if (attempt.ok) return attempt.value
  await runIsolated(runner, () => recordFailure(runner, params))
  return { kind: 'failed', reason: 'send_failed' }
}
