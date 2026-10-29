/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF3/RF4): o boleto aceito da contratante sai sozinho por WhatsApp (Evolution) a **todos** os números do
 * cliente da nota, quando a caixa do WhatsApp do tipo está ligada e em `automatic`. Mesmo trilho do envio manual da 281
 * (`forward-contractor-reply-by-whatsapp`): um envio por número, idempotente por (retorno, anexo, número) — a mesma chave
 * da primeira tentativa manual, então o botão depois não manda de novo ao mesmo número —, linha em
 * `occurrence_contractor_reply_deliveries` com gatilho `automatic` e sem usuário (o ator é o Sistema).
 *
 * Duas fases, como no manual: a **reserva** (`queued`) na transação que entrega o boleto ao motorista, e o **despacho**
 * depois do commit (o Evolution nunca é chamado com transação aberta). O despacho toma cada entrega para si pela trava
 * `claimed_at` (`update … where claimed_at is null`): duas chamadas nunca mandam o mesmo boleto duas vezes.
 *
 * RF4, nunca em silêncio: sem modelo, sem instância ativa ou sem número no cadastro, nada é reservado e fica uma linha
 * `skipped` com o motivo; se nenhum número recebeu (instância caída, número sem WhatsApp, falha), o boleto cai para o
 * e-mail do cliente, com a caixa do e-mail ligada (`queueContractorReplyToClientEmails` com `fallbackFrom`). As linhas
 * do WhatsApp e do e-mail são o registro na linha do tempo.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-parity.contract.ts` do worker compara os dois arquivos.
 * Falha da reserva nunca desfaz o retorno: roda num savepoint e o erro vira uma linha `failed`.
 * Nenhum log aqui: número, texto e anexo nunca saem do banco.
 */
import { createHash } from 'node:crypto'

import { sql, type SQL } from 'drizzle-orm'

import { CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE } from '../../shared/occurrence-contractor-reply.constant.js'
import { queueContractorReplyToClientEmails } from './contractor-reply-client-email-forward.support.js'
import {
  readContractorReplyClientChannel,
  resolveContractorReplyClientTexts,
} from './contractor-reply-client-template.support.js'

export type ContractorReplyClientWhatsAppRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type ContractorReplyClientWhatsAppSkipReason =
  | 'client_without_whatsapp'
  | 'template_missing'
  | 'whatsapp_disconnected'

export type ReserveContractorReplyToClientWhatsAppResult =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'skipped'; readonly reason: ContractorReplyClientWhatsAppSkipReason }
  | {
      readonly kind: 'failed'
      readonly reason: 'attachment_too_large_for_whatsapp' | 'send_failed'
    }
  | {
      readonly alreadyQueued: number
      readonly kind: 'reserved'
      readonly overLimit: number
      readonly queued: number
    }

/** O envio pelo Evolution da empresa; a falha traz `failure` (o motivo fechado do gateway da 281). */
export type ContractorReplyClientWhatsAppSender = {
  isConnected(params: { readonly companyId: string }): Promise<boolean>
  sendDocument(params: {
    readonly bytes: Uint8Array
    readonly caption: string
    readonly companyId: string
    readonly fileName: string
    readonly mimeType: string
    readonly number: string
  }): Promise<{ readonly providerMessageId: null | string }>
}

export type DispatchContractorReplyClientWhatsAppDependencies = {
  readonly readAttachment: (params: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  /** Fora de transação: a trava e os fechamentos são um comando cada. */
  readonly runner: ContractorReplyClientWhatsAppRunner
  readonly sender: ContractorReplyClientWhatsAppSender
  readonly transaction: <TResult>(
    operation: (runner: ContractorReplyClientWhatsAppRunner) => Promise<TResult>,
  ) => Promise<TResult>
}

export type DispatchContractorReplyClientWhatsAppResult = {
  readonly failed: number
  /** RF4: nenhum número recebeu e o e-mail do cliente foi tentado. */
  readonly fellBackToEmail: boolean
  readonly sent: number
}

type Row = Record<string, unknown>

const TARGET = 'client_boleto_whatsapp'
const SAVEPOINT = 'client_whatsapp_forward'
const AUTOMATIC_MODE = 'automatic'
const RECIPIENT_ROLE = 'recipient'
const BOLETO_PURPOSE = 'boleto'
const COUNTED_STATUSES = ['queued', 'sent'] as const
const MB = 1024 * 1024
/** O teto do arquivo no chat do WhatsApp (281 RF1); acima disso nem se chama o Evolution. */
const MAX_BYTES = 25 * MB
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/u
const DIGEST_LENGTH = 32
/** O dia do teto diário é o de Brasília (sem horário de verão desde 2019), como no envio manual. */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_FILE_NAME = 'boleto.pdf'
const NOTICE_KIND = 'client_boleto_whatsapp_sent'
/** O texto que o app e o painel mostram; o `system_notice` guarda o resto (quem enviou e qual entrega). */
const NOTICE_BODY_PREFIX = 'Boleto enviado por WhatsApp: '
const SEND_FAILURES = ['disconnected', 'failed', 'number_not_found'] as const
type SendFailure = (typeof SEND_FAILURES)[number]
const FAILURE_REASON: Readonly<Record<SendFailure, string>> = {
  disconnected: 'whatsapp_disconnected',
  failed: 'send_failed',
  number_not_found: 'whatsapp_number_not_found',
}

async function rowsOf(
  runner: ContractorReplyClientWhatsAppRunner,
  query: SQL,
): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

function digestKey(parts: string): string {
  const digest = createHash('sha256').update(parts).digest('hex').slice(0, DIGEST_LENGTH)
  return `${TARGET}:${digest}`
}

/** A mesma chave da primeira tentativa do envio manual (`firstAttemptKey`): um boleto, um número, uma vez. */
function deriveNumberKey(params: {
  readonly address: string
  readonly attachmentId: string
  readonly replyId: string
}): string {
  return digestKey(`${params.replyId}:${params.attachmentId}:${params.address}`)
}

/** A tentativa automática inteira que não sai (sem modelo, sem instância, sem número): uma linha por (retorno, anexo). */
function deriveAttemptKey(params: {
  readonly attachmentId: string
  readonly replyId: string
}): string {
  return digestKey(`${params.replyId}:${AUTOMATIC_MODE}:${params.attachmentId}`)
}

function startOfBrasiliaDay(now: Date): Date {
  const local = now.getTime() - BRASILIA_OFFSET_MS
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + BRASILIA_OFFSET_MS)
}

function inList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

async function recordDelivery(
  runner: ContractorReplyClientWhatsAppRunner,
  params: {
    readonly address: null | string
    readonly attachmentId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly reason: null | string
    readonly replyId: string
    readonly status: 'failed' | 'queued' | 'skipped'
  },
): Promise<void> {
  await rowsOf(
    runner,
    sql`insert into occurrence_contractor_reply_deliveries
          (company_id, reply_id, target, trigger, status, reason, attachment_id, address, actor_user_id, idempotency_key)
        values (${params.companyId}::uuid, ${params.replyId}::uuid, ${TARGET}, 'automatic', ${params.status},
                ${params.reason}, ${params.attachmentId}::uuid, ${params.address}, null, ${params.idempotencyKey})
        on conflict do nothing`,
  )
}

/** Os números de WhatsApp do boleto no cadastro do cliente (o destinatário da nota), na ordem do cadastro. */
async function listClientNumbers(
  runner: ContractorReplyClientWhatsAppRunner,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly string[]> {
  const rows = await rowsOf(
    runner,
    sql`select contact.address
        from trip_document_occurrences occurrence
        join trip_documents document
          on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
        join nfe_participants participant
          on participant.company_id = document.company_id and participant.document_id = document.nfe_document_id
         and participant.role = ${RECIPIENT_ROLE}
        join delivery_client_contacts contact
          on contact.company_id = participant.company_id and contact.tax_id = participant.tax_id
         and contact.channel = 'whatsapp' and contact.purpose = ${BOLETO_PURPOSE}
        where occurrence.company_id = ${params.companyId}::uuid and occurrence.id = ${params.occurrenceId}::uuid
        order by contact.created_at, contact.id`,
  )
  const numbers: string[] = []
  for (const row of rows) {
    const number = (text(row, 'address') ?? '').trim()
    if (E164_PATTERN.test(number) && !numbers.includes(number)) numbers.push(number)
  }
  return numbers
}

type Skip = (reason: ContractorReplyClientWhatsAppSkipReason) => Promise<{
  readonly kind: 'skipped'
  readonly reason: ContractorReplyClientWhatsAppSkipReason
}>

async function reserve(
  runner: ContractorReplyClientWhatsAppRunner,
  params: { readonly companyId: string; readonly now: Date; readonly replyId: string },
): Promise<ReserveContractorReplyToClientWhatsAppResult> {
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
  if (attachmentId === null || occurrenceId === null) return { kind: 'not_applicable' }

  /** O WhatsApp só tinha envio manual antes da 286: sem a caixa ligada em automático, nada sai sozinho. */
  const setting = await readContractorReplyClientChannel(runner, {
    channel: 'whatsapp',
    companyId,
    occurrenceId,
  })
  if (setting === null || !setting.enabled || setting.sendMode !== AUTOMATIC_MODE) {
    return { kind: 'not_applicable' }
  }

  const skip: Skip = async (reason) => {
    await recordDelivery(runner, {
      address: null,
      attachmentId,
      companyId,
      idempotencyKey: deriveAttemptKey({ attachmentId, replyId }),
      reason,
      replyId,
      status: 'skipped',
    })
    return { kind: 'skipped', reason }
  }

  const resolved = await resolveContractorReplyClientTexts(runner, {
    channel: 'whatsapp',
    companyId,
    occurrenceId,
  })
  if (resolved.kind === 'template_missing') return skip('template_missing')

  const [evolution] = await rowsOf(
    runner,
    sql`select status, daily_cap from whatsapp_evolution_settings where company_id = ${companyId}::uuid`,
  )
  if (text(evolution, 'status') !== 'active') return skip('whatsapp_disconnected')

  const numbers = await listClientNumbers(runner, { companyId, occurrenceId })
  if (numbers.length === 0) return skip('client_without_whatsapp')

  const planned: { readonly address: string; readonly idempotencyKey: string }[] = []
  let alreadyQueued = 0
  for (const address of numbers) {
    const idempotencyKey = deriveNumberKey({ address, attachmentId, replyId })
    const [existing] = await rowsOf(
      runner,
      sql`select id from occurrence_contractor_reply_deliveries
          where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}`,
    )
    if (existing === undefined) planned.push({ address, idempotencyKey })
    else alreadyQueued += 1
  }
  if (planned.length === 0) return { alreadyQueued, kind: 'reserved', overLimit: 0, queued: 0 }

  const [attachment] = await rowsOf(
    runner,
    sql`select size_bytes from occurrence_conversation_attachments
        where company_id = ${companyId}::uuid and id = ${attachmentId}::uuid`,
  )
  if (Number(attachment?.size_bytes ?? 0) > MAX_BYTES) {
    for (const item of planned) {
      await recordDelivery(runner, {
        address: item.address,
        attachmentId,
        companyId,
        idempotencyKey: item.idempotencyKey,
        reason: 'attachment_too_large_for_whatsapp',
        replyId,
        status: 'failed',
      })
    }
    return { kind: 'failed', reason: 'attachment_too_large_for_whatsapp' }
  }

  /** Os tetos do envio manual: por ocorrência (o da 279) e o diário da empresa; o resto fica para o botão. */
  const [perReply] = await rowsOf(
    runner,
    sql`select count(*)::int as total from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and reply_id = ${replyId}::uuid
          and target = ${TARGET} and status in (${inList(COUNTED_STATUSES)})`,
  )
  const [today] = await rowsOf(
    runner,
    sql`select count(*)::int as total from occurrence_contractor_reply_deliveries
        where company_id = ${companyId}::uuid and target = ${TARGET}
          and status in (${inList(COUNTED_STATUSES)})
          and created_at >= ${startOfBrasiliaDay(params.now).toISOString()}::timestamptz`,
  )
  const remaining = Math.max(
    0,
    Math.min(
      CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE - Number(perReply?.total ?? 0),
      Number(evolution?.daily_cap ?? 0) - Number(today?.total ?? 0),
    ),
  )
  const sending = planned.slice(0, remaining)
  for (const item of sending) {
    await recordDelivery(runner, {
      address: item.address,
      attachmentId,
      companyId,
      idempotencyKey: item.idempotencyKey,
      reason: null,
      replyId,
      status: 'queued',
    })
  }
  return {
    alreadyQueued,
    kind: 'reserved',
    overLimit: planned.length - sending.length,
    queued: sending.length,
  }
}

async function recordFailure(
  runner: ContractorReplyClientWhatsAppRunner,
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
  await recordDelivery(runner, {
    address: null,
    attachmentId,
    companyId,
    idempotencyKey: deriveAttemptKey({ attachmentId, replyId }),
    reason: 'send_failed',
    replyId,
    status: 'failed',
  })
}

/** Um savepoint por tentativa: o que falhar desfaz só a própria escrita, nunca o que veio antes na transação. */
async function runIsolated<TResult>(
  runner: ContractorReplyClientWhatsAppRunner,
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
 * A reserva, na transação que entrega o boleto ao motorista. Sem nada reservado por falta de modelo, de instância ou de
 * número, o boleto cai para o e-mail do cliente na mesma transação (RF4). Falha nunca desfaz o que veio antes.
 */
export async function reserveContractorReplyToClientWhatsApp(
  runner: ContractorReplyClientWhatsAppRunner,
  params: { readonly companyId: string; readonly now: Date; readonly replyId: string },
): Promise<ReserveContractorReplyToClientWhatsAppResult> {
  const attempt = await runIsolated(runner, () => reserve(runner, params))
  if (!attempt.ok) {
    await runIsolated(runner, () => recordFailure(runner, params))
    return { kind: 'failed', reason: 'send_failed' }
  }
  if (attempt.value.kind === 'skipped' || attempt.value.kind === 'failed') {
    await queueContractorReplyToClientEmails(runner, {
      companyId: params.companyId,
      fallbackFrom: 'whatsapp',
      replyId: params.replyId,
    })
  }
  return attempt.value
}

function failureOf(error: unknown): SendFailure {
  const failure =
    typeof error === 'object' && error !== null && 'failure' in error
      ? (error as { readonly failure: unknown }).failure
      : undefined
  return SEND_FAILURES.find((known) => known === failure) ?? 'failed'
}

async function markFailed(
  runner: ContractorReplyClientWhatsAppRunner,
  params: { readonly companyId: string; readonly deliveryId: string; readonly reason: string },
): Promise<void> {
  await rowsOf(
    runner,
    sql`update occurrence_contractor_reply_deliveries set status = 'failed', reason = ${params.reason}
        where company_id = ${params.companyId}::uuid and id = ${params.deliveryId}::uuid and status = 'queued'`,
  )
}

/**
 * O fechamento em `sent`, com o aviso na conversa do motorista (o mesmo da 281, pelo id do provedor o webhook avança
 * enviada → entregue → lida). Só a entrega ainda `queued` muda; sem conversa do motorista não há aviso.
 */
async function markSent(
  runner: ContractorReplyClientWhatsAppRunner,
  params: {
    readonly companyId: string
    readonly deliveryId: string
    readonly providerMessageId: null | string
  },
): Promise<void> {
  const { companyId, deliveryId } = params
  const closed = await rowsOf(
    runner,
    sql`update occurrence_contractor_reply_deliveries
        set status = 'sent', reason = null, sent_at = now(), provider_message_id = ${params.providerMessageId}
        where company_id = ${companyId}::uuid and id = ${deliveryId}::uuid and status = 'queued'
        returning id`,
  )
  if (closed.length === 0) return
  await rowsOf(
    runner,
    sql`insert into occurrence_conversation_messages
          (company_id, conversation_id, channel, direction, automatic, body_text, status, status_times,
           provider_message_id, system_notice)
        select d.company_id, c.id, 'whatsapp', 'outbound', true,
               ${NOTICE_BODY_PREFIX} || d.address,
               'sent',
               jsonb_build_object('sent', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
               d.provider_message_id,
               jsonb_build_object(
                 'kind', ${NOTICE_KIND}::text,
                 'deliveryId', d.id::text,
                 'actorKind', 'system',
                 'actorName', null)
          from occurrence_contractor_reply_deliveries d
          join occurrence_contractor_replies r
            on r.company_id = d.company_id and r.id = d.reply_id
          join occurrence_conversations c
            on c.company_id = r.company_id and c.occurrence_kind = 'document'
           and c.occurrence_id = r.occurrence_id and c.participant = 'driver'
         where d.company_id = ${companyId}::uuid
           and d.id = ${deliveryId}::uuid
           and d.target = ${TARGET}
           and d.status = 'sent'
        on conflict do nothing`,
  )
}

/**
 * O despacho, depois do commit da reserva: toma para si as entregas automáticas ainda `queued` da empresa (de um retorno,
 * com `replyId`; sem ele, todas as que ficaram para trás), confere a instância (caída fecha tudo em
 * `whatsapp_disconnected`, sem chamar o envio), lê o arquivo uma vez e manda a cada número em sequência. Retorno em que
 * nenhum número recebeu cai para o e-mail (RF4). Toda entrega tomada termina fechada.
 */
export async function dispatchContractorReplyClientWhatsApp(
  dependencies: DispatchContractorReplyClientWhatsAppDependencies,
  params: { readonly companyId: string; readonly replyId?: string },
): Promise<DispatchContractorReplyClientWhatsAppResult> {
  const { companyId } = params
  const claimed = await rowsOf(
    dependencies.runner,
    sql`update occurrence_contractor_reply_deliveries set claimed_at = now()
        where company_id = ${companyId}::uuid and target = ${TARGET}
          and trigger = 'automatic' and status = 'queued' and claimed_at is null
          ${params.replyId === undefined ? sql`` : sql`and reply_id = ${params.replyId}::uuid`}
        returning id, reply_id, address, attachment_id`,
  )
  const byReply = new Map<string, ClaimedDelivery[]>()
  for (const row of claimed) {
    const id = text(row, 'id')
    const replyId = text(row, 'reply_id')
    const address = text(row, 'address')
    const attachmentId = text(row, 'attachment_id')
    if (id === null || replyId === null || address === null || attachmentId === null) continue
    byReply.set(replyId, [...(byReply.get(replyId) ?? []), { address, attachmentId, id }])
  }
  const result = { failed: 0, fellBackToEmail: false, sent: 0 }
  for (const [replyId, items] of byReply) {
    const outcome = await dispatchReply(dependencies, { companyId, items, replyId })
    result.failed += outcome.failed
    result.sent += outcome.sent
    result.fellBackToEmail ||= outcome.fellBackToEmail
  }
  return result
}

type ClaimedDelivery = {
  readonly address: string
  readonly attachmentId: string
  readonly id: string
}

async function dispatchReply(
  dependencies: DispatchContractorReplyClientWhatsAppDependencies,
  params: {
    readonly companyId: string
    readonly items: readonly ClaimedDelivery[]
    readonly replyId: string
  },
): Promise<DispatchContractorReplyClientWhatsAppResult> {
  const { companyId, items, replyId } = params
  const { runner } = dependencies
  const result = { failed: 0, fellBackToEmail: false, sent: 0 }
  const fail = async (deliveryId: string, reason: string) => {
    await markFailed(runner, { companyId, deliveryId, reason })
    result.failed += 1
  }
  const prepared = await prepareDispatch(dependencies, { companyId, items, replyId })
  for (const item of items) {
    if (prepared.kind === 'failed') {
      await fail(item.id, prepared.reason)
      continue
    }
    const file = prepared.files.get(item.attachmentId)
    if (file === undefined) {
      await fail(item.id, 'send_failed')
      continue
    }
    let sent: { readonly providerMessageId: null | string }
    try {
      sent = await dependencies.sender.sendDocument({
        bytes: file.bytes,
        caption: prepared.caption,
        companyId,
        fileName: file.fileName,
        mimeType: file.contentType,
        number: item.address,
      })
    } catch (error) {
      await fail(item.id, FAILURE_REASON[failureOf(error)])
      continue
    }
    // Saiu: se o fechamento falhar, a entrega fica `queued` (em andamento) — melhor um estado parado do que o mesmo
    // boleto duas vezes no WhatsApp do cliente.
    await dependencies.transaction((transaction) =>
      markSent(transaction, {
        companyId,
        deliveryId: item.id,
        providerMessageId: sent.providerMessageId,
      }),
    )
    result.sent += 1
  }

  if (result.sent === 0 && result.failed > 0) {
    await dependencies.transaction((transaction) =>
      queueContractorReplyToClientEmails(transaction, {
        companyId,
        fallbackFrom: 'whatsapp',
        replyId,
      }),
    )
    result.fellBackToEmail = true
  }
  return result
}

type PreparedFile = {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly fileName: string
}

async function prepareDispatch(
  dependencies: DispatchContractorReplyClientWhatsAppDependencies,
  params: {
    readonly companyId: string
    readonly items: readonly { readonly attachmentId: string }[]
    readonly replyId: string
  },
): Promise<
  | { readonly kind: 'failed'; readonly reason: string }
  | {
      readonly caption: string
      readonly files: ReadonlyMap<string, PreparedFile>
      readonly kind: 'ready'
    }
> {
  const { companyId, replyId } = params
  const { runner } = dependencies
  const [reply] = await rowsOf(
    runner,
    sql`select config, occurrence_id from occurrence_contractor_replies
        where company_id = ${companyId}::uuid and id = ${replyId}::uuid`,
  )
  const occurrenceId = text(reply, 'occurrence_id')
  if (occurrenceId === null) return { kind: 'failed', reason: 'send_failed' }
  const resolved = await resolveContractorReplyClientTexts(runner, {
    channel: 'whatsapp',
    companyId,
    occurrenceId,
  })
  if (resolved.kind === 'template_missing') return { kind: 'failed', reason: 'template_missing' }

  const connected = await dependencies.sender.isConnected({ companyId }).catch(() => false)
  if (!connected) return { kind: 'failed', reason: 'whatsapp_disconnected' }

  const files = new Map<string, PreparedFile>()
  try {
    for (const attachmentId of new Set(params.items.map((item) => item.attachmentId))) {
      const [row] = await rowsOf(
        runner,
        sql`select object.bucket, object.object_key, attachment.file_name, attachment.content_type
            from occurrence_conversation_attachments attachment
            join stored_objects object
              on object.company_id = attachment.company_id and object.id = attachment.stored_object_id
             and object.status <> 'deleted'
            where attachment.company_id = ${companyId}::uuid and attachment.id = ${attachmentId}::uuid`,
      )
      const bucket = text(row, 'bucket')
      const key = text(row, 'object_key')
      if (bucket === null || key === null) continue
      const fileName = (text(row, 'file_name') ?? '').trim()
      files.set(attachmentId, {
        bytes: await dependencies.readAttachment({ bucket, key }),
        contentType: text(row, 'content_type') ?? 'application/pdf',
        fileName: fileName === '' ? DEFAULT_FILE_NAME : fileName,
      })
    }
  } catch {
    return { kind: 'failed', reason: 'send_failed' }
  }
  return { caption: resolved.texts.body, files, kind: 'ready' }
}
