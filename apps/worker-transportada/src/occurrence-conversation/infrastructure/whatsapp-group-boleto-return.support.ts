/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7 (regra 9): **o boleto da contratante volta ao grupo de onde o pedido saiu.** O pedido aberto no grupo
 * do motorista registra a ocorrência com a chave `whatsapp-group-request:<id>` (`trip_field_reports.result_id` é a
 * ocorrência). Quando a resposta da contratante anda, o grupo fica sabendo:
 *
 * - **entregue** ao motorista: se algum envio ao cliente saiu (WhatsApp ou e-mail do cliente, ou o destinatário da
 *   nota), o grupo recebe só o aviso "enviado ao cliente" com o contato mascarado; se nenhum saiu (cliente sem
 *   contato, ou o WhatsApp dele falhou), o **PDF vai ao grupo** para o motorista repassar. Envio ao cliente ainda em
 *   andamento (WhatsApp `queued` há pouco) espera a próxima passada;
 * - **com o escritório** (`needs_operator`/`awaiting_operator`: boleto que não passou na conferência ou tipo de
 *   entrega manual): um aviso curto, uma vez; quando o escritório entregar, o retorno acima sai normalmente;
 * - **vencido** (`overdue`, o alarme da 248 já avisou a operação): um aviso, uma vez, com o jeito de pedir de novo.
 *
 * O estado mora no próprio pedido (`whatsapp_group_requests.state.boletoReturn`), tomado por `version` antes de
 * chamar o Evolution: duas passadas ao mesmo tempo mandam uma vez só. Falha de envio conta tentativa e tenta de novo
 * na próxima passada, até `GROUP_BOLETO_RETURN_MAX_ATTEMPTS`; a ocorrência e a entrega ao motorista nunca dependem
 * disto. Nada de valor nem nome do cliente no texto do grupo, só o número da nota.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o contrato
 * `contractor-reply-parity.contract.ts` do worker compara os dois arquivos. Nenhum log aqui.
 */
import { sql, type SQL } from 'drizzle-orm'

export type GroupBoletoReturnRunner = { execute(query: SQL): PromiseLike<unknown> }

export type GroupBoletoReturnSender = {
  sendDocument(params: {
    readonly bytes: Uint8Array
    readonly caption: string
    readonly companyId: string
    readonly fileName: string
    readonly mimeType: string
    /** O `@g.us` do grupo: o SDK 0.3.0 do Evolution não normaliza grupo. */
    readonly number: string
  }): Promise<unknown>
  sendText(params: {
    readonly body: string
    readonly companyId: string
    readonly number: string
  }): Promise<unknown>
}

export type DispatchGroupBoletoReturnsDependencies = {
  readonly readAttachment: (location: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  readonly runner: GroupBoletoReturnRunner
  readonly sender: GroupBoletoReturnSender
}

export type DispatchGroupBoletoReturnsResult = {
  readonly failed: number
  readonly sent: number
}

/** Só os pedidos dos últimos dias: a contratante que responde depois disso já não é assunto do grupo. */
export const GROUP_BOLETO_RETURN_LOOKBACK_DAYS = 14
/** Tentativas de envio ao grupo por aviso; depois disso o pedido fica `failed` e a passada desiste dele. */
export const GROUP_BOLETO_RETURN_MAX_ATTEMPTS = 3
/** Envio ao cliente pelo WhatsApp ainda `queued` há menos que isto: espera o despacho dele terminar. */
export const GROUP_BOLETO_RETURN_CLIENT_WAIT_SECONDS = 600
const BATCH_LIMIT = 50
const DEFAULT_FILE_NAME = 'boleto.pdf'

export const GROUP_BOLETO_RETURN_REQUEST_KEY_PREFIX = 'whatsapp-group-request:'

export type GroupBoletoReturnNotice = 'delivered' | 'office' | 'overdue'

export const GROUP_BOLETO_RETURN_TEXT = {
  clientSent: (documentNumber: string, contacts: readonly string[]) =>
    [
      `✅ *Boleto atualizado da NF ${documentNumber}*`,
      '',
      `A contratante respondeu e o boleto já foi enviado ao cliente: ${contacts.map((contact) => `*${contact}*`).join(', ')}.`,
      'Ele também está no chat da ocorrência no aplicativo.',
    ].join('\n'),
  document: (documentNumber: string) =>
    [
      `📄 *Boleto atualizado da NF ${documentNumber}*`,
      '',
      'A contratante respondeu. Segue o boleto para repassar ao cliente.',
    ].join('\n'),
  office: (documentNumber: string) =>
    [
      `🔎 *NF ${documentNumber}: a contratante respondeu*`,
      '',
      'O escritório vai conferir o arquivo antes de liberar. Assim que liberarem, o boleto vem para cá.',
    ].join('\n'),
  overdue: (documentNumber: string) =>
    [
      `⏳ *NF ${documentNumber}: o boleto ainda não chegou*`,
      '',
      'A contratante não respondeu no prazo e o escritório já foi avisado.',
      `Para pedir de novo à contratante, me marque e escreva: *pedir boleto de novo ${documentNumber}*`,
    ].join('\n'),
} as const

type Row = Record<string, unknown>

/**
 * `whatsapp_group_requests.state.boletoReturn` — lido também pela linha do tempo da ocorrência:
 * - `notices`: quando cada aviso saiu ao grupo (ISO);
 * - `outcome`: como o boleto entregue chegou ao grupo — `posted_to_group` (o PDF) ou `sent_to_client` (só o aviso);
 * - `status`: `sent` (último aviso saiu) ou `failed` (desistiu depois de `GROUP_BOLETO_RETURN_MAX_ATTEMPTS`);
 * - `lastFailedAt`: a última tentativa que não saiu; `attempts`: tentativas contadas.
 */
export type GroupBoletoReturnState = {
  readonly attempts?: number
  readonly lastFailedAt?: string
  readonly notices?: Readonly<Partial<Record<GroupBoletoReturnNotice, string>>>
  readonly outcome?: 'posted_to_group' | 'sent_to_client'
  readonly status?: 'failed' | 'sent'
}
type BoletoReturnState = GroupBoletoReturnState

async function rowsOf(runner: GroupBoletoReturnRunner, query: SQL): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): null | string {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

function returnStateOf(value: unknown): BoletoReturnState {
  if (typeof value !== 'object' || value === null) return {}
  const boletoReturn = (value as Record<string, unknown>).boletoReturn
  return typeof boletoReturn === 'object' && boletoReturn !== null
    ? (boletoReturn as BoletoReturnState)
    : {}
}

/** "+5516991225783" → "(16) •••••-5783"; e-mail → "fi•••@dominio"; o resto só com os 4 últimos. */
export function maskGroupBoletoContact(address: string): string {
  const trimmed = address.trim()
  const at = trimmed.indexOf('@')
  if (at > 0) return `${trimmed.slice(0, Math.min(2, at))}•••${trimmed.slice(at)}`
  const digits = trimmed.replace(/\D/gu, '')
  if (/^55\d{10,11}$/u.test(digits)) return `(${digits.slice(2, 4)}) •••••-${digits.slice(-4)}`
  return digits.length >= 4 ? `•••${digits.slice(-4)}` : '•••'
}

/** Que aviso cabe agora, ou `null` (nada a dizer, ou já dito). */
function noticeFor(params: {
  readonly replyStatus: string
  readonly state: BoletoReturnState
}): GroupBoletoReturnNotice | null {
  const { notices = {} } = params.state
  if (params.replyStatus === 'delivered')
    return notices.delivered === undefined ? 'delivered' : null
  if (params.replyStatus === 'needs_operator' || params.replyStatus === 'awaiting_operator') {
    return notices.office === undefined && notices.delivered === undefined ? 'office' : null
  }
  if (params.replyStatus === 'overdue') {
    return notices.overdue === undefined && notices.delivered === undefined ? 'overdue' : null
  }
  return null
}

type Candidate = {
  readonly companyId: string
  readonly documentNumber: string
  readonly groupJid: string
  readonly notice: GroupBoletoReturnNotice
  readonly replyId: string
  readonly requestId: string
  readonly state: BoletoReturnState
  readonly version: string
}

async function listCandidates(
  runner: GroupBoletoReturnRunner,
  params: { readonly companyId?: string; readonly now: Date },
): Promise<readonly Candidate[]> {
  const since = new Date(
    params.now.getTime() - GROUP_BOLETO_RETURN_LOOKBACK_DAYS * 86_400_000,
  ).toISOString()
  const rows = await rowsOf(
    runner,
    sql`select request.id as request_id, request.company_id, request.group_jid, request.state,
               request.version::text as version, reply.id as reply_id, reply.status as reply_status,
               coalesce(nullif(request.state->>'documentNumber', ''), note.number, '') as document_number
          from whatsapp_group_requests request
          join trip_field_reports report
            on report.company_id = request.company_id
           and report.idempotency_key = ${GROUP_BOLETO_RETURN_REQUEST_KEY_PREFIX} || request.id::text
           and report.result_id is not null
          join occurrence_contractor_replies reply
            on reply.company_id = report.company_id and reply.occurrence_id = report.result_id
          left join trip_document_occurrences occurrence
            on occurrence.company_id = reply.company_id and occurrence.id = reply.occurrence_id
          left join trip_documents document
            on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
          left join nfe_documents note
            on note.company_id = document.company_id and note.id = document.nfe_document_id
         where request.status = 'completed'
           and request.opened_at >= ${since}::timestamptz
           ${params.companyId === undefined ? sql`` : sql`and request.company_id = ${params.companyId}::uuid`}
           and reply.status in ('delivered', 'needs_operator', 'awaiting_operator', 'overdue')
           and coalesce(request.state->'boletoReturn'->>'status', '') <> 'failed'
           and request.state->'boletoReturn'->'notices'->>'delivered' is null
         order by request.opened_at
         limit ${BATCH_LIMIT}`,
  )
  const candidates: Candidate[] = []
  for (const row of rows) {
    const companyId = text(row, 'company_id')
    const groupJid = text(row, 'group_jid')
    const replyId = text(row, 'reply_id')
    const requestId = text(row, 'request_id')
    const version = text(row, 'version')
    if (
      companyId === null ||
      groupJid === null ||
      replyId === null ||
      requestId === null ||
      version === null
    ) {
      continue
    }
    const state = returnStateOf(row.state)
    const notice = noticeFor({ replyStatus: text(row, 'reply_status') ?? '', state })
    if (notice === null) continue
    candidates.push({
      companyId,
      documentNumber: text(row, 'document_number') ?? '',
      groupJid,
      notice,
      replyId,
      requestId,
      state,
      version,
    })
  }
  return candidates
}

/**
 * Os envios ao cliente deste retorno: `wait` quando o WhatsApp do cliente ainda está saindo; senão os contatos que
 * receberam (vazio: ninguém recebeu, o PDF vai ao grupo). E-mail na fila conta como enviado: ele sai pelo worker.
 */
async function clientDeliveriesOf(
  runner: GroupBoletoReturnRunner,
  params: { readonly companyId: string; readonly now: Date; readonly replyId: string },
): Promise<
  { readonly kind: 'wait' } | { readonly contacts: readonly string[]; readonly kind: 'ready' }
> {
  const rows = await rowsOf(
    runner,
    sql`select target, status, address, created_at >= ${new Date(
      params.now.getTime() - GROUP_BOLETO_RETURN_CLIENT_WAIT_SECONDS * 1000,
    ).toISOString()}::timestamptz as recent
          from occurrence_contractor_reply_deliveries
         where company_id = ${params.companyId}::uuid and reply_id = ${params.replyId}::uuid
           and target in ('client_boleto_whatsapp', 'client_boleto_emails', 'note_recipient_email', 'informed_email')`,
  )
  const contacts: string[] = []
  for (const row of rows) {
    const status = text(row, 'status')
    const target = text(row, 'target')
    const address = text(row, 'address')
    if (target === 'client_boleto_whatsapp' && status === 'queued') {
      if (row.recent === true) return { kind: 'wait' }
      continue
    }
    const reached =
      status === 'sent' || (target !== 'client_boleto_whatsapp' && status === 'queued')
    if (!reached || address === null) continue
    const masked = maskGroupBoletoContact(address)
    if (!contacts.includes(masked)) contacts.push(masked)
  }
  return { contacts, kind: 'ready' }
}

/** O arquivo que chegou ao motorista (o último entregue no chat do app), ou o anexo aceito do retorno. */
async function deliveredFileOf(
  dependencies: DispatchGroupBoletoReturnsDependencies,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<null | {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly fileName: string
}> {
  const [row] = await rowsOf(
    dependencies.runner,
    sql`select object.bucket, object.object_key, attachment.file_name, attachment.content_type
          from occurrence_contractor_replies reply
          join occurrence_conversation_attachments attachment
            on attachment.company_id = reply.company_id
           and attachment.id = coalesce(
                 (select delivery.attachment_id from occurrence_contractor_reply_deliveries delivery
                   where delivery.company_id = reply.company_id and delivery.reply_id = reply.id
                     and delivery.target = 'driver_app_chat' and delivery.status = 'sent'
                   order by delivery.sent_at desc nulls last
                   limit 1),
                 reply.reply_attachment_id)
          join stored_objects object
            on object.company_id = attachment.company_id and object.id = attachment.stored_object_id
           and object.status <> 'deleted'
         where reply.company_id = ${params.companyId}::uuid and reply.id = ${params.replyId}::uuid`,
  )
  const bucket = text(row, 'bucket')
  const key = text(row, 'object_key')
  if (bucket === null || key === null) return null
  const fileName = (text(row, 'file_name') ?? '').trim()
  return {
    bytes: await dependencies.readAttachment({ bucket, key }),
    contentType: text(row, 'content_type') ?? 'application/pdf',
    fileName: fileName === '' ? DEFAULT_FILE_NAME : fileName,
  }
}

/** Grava o desfecho do aviso no pedido, se ninguém andou o pedido no meio (`version`). */
async function settle(
  runner: GroupBoletoReturnRunner,
  candidate: Candidate,
  next: BoletoReturnState,
): Promise<boolean> {
  const updated = await rowsOf(
    runner,
    sql`update whatsapp_group_requests
           set state = jsonb_set(state, '{boletoReturn}', ${JSON.stringify(next)}::jsonb, true),
               version = version + 1
         where company_id = ${candidate.companyId}::uuid and id = ${candidate.requestId}::uuid
           and version = ${candidate.version}::bigint
         returning version::text as version`,
  )
  return updated.length > 0
}

/**
 * A passada: acha os pedidos do grupo cujo retorno andou e manda o aviso que cabe, um por pedido. Sem `companyId`,
 * todas as empresas (a batida do alarme); com ele, só a empresa do evento que acabou de acontecer.
 */
export async function dispatchWhatsAppGroupBoletoReturns(
  dependencies: DispatchGroupBoletoReturnsDependencies,
  params: { readonly companyId?: string; readonly now: Date },
): Promise<DispatchGroupBoletoReturnsResult> {
  const result = { failed: 0, sent: 0 }
  for (const candidate of await listCandidates(dependencies.runner, params)) {
    const outcome = await returnOne(dependencies, { candidate, now: params.now })
    if (outcome === 'sent') result.sent += 1
    if (outcome === 'failed') result.failed += 1
  }
  return result
}

async function returnOne(
  dependencies: DispatchGroupBoletoReturnsDependencies,
  params: { readonly candidate: Candidate; readonly now: Date },
): Promise<'failed' | 'sent' | 'skipped'> {
  const { candidate, now } = params
  const { companyId, documentNumber, groupJid } = candidate

  let send: () => Promise<unknown>
  let outcome: GroupBoletoReturnState['outcome'] = candidate.state.outcome
  if (candidate.notice === 'delivered') {
    const deliveries = await clientDeliveriesOf(dependencies.runner, {
      companyId,
      now,
      replyId: candidate.replyId,
    })
    if (deliveries.kind === 'wait') return 'skipped'
    if (deliveries.contacts.length > 0) {
      const body = GROUP_BOLETO_RETURN_TEXT.clientSent(documentNumber, deliveries.contacts)
      outcome = 'sent_to_client'
      send = () => dependencies.sender.sendText({ body, companyId, number: groupJid })
    } else {
      outcome = 'posted_to_group'
      send = async () => {
        const file = await deliveredFileOf(dependencies, {
          companyId,
          replyId: candidate.replyId,
        })
        if (file === null) throw new Error('GROUP_BOLETO_RETURN_FILE_NOT_FOUND')
        return dependencies.sender.sendDocument({
          bytes: file.bytes,
          caption: GROUP_BOLETO_RETURN_TEXT.document(documentNumber),
          companyId,
          fileName: file.fileName,
          mimeType: file.contentType,
          number: groupJid,
        })
      }
    }
  } else {
    const body =
      candidate.notice === 'office'
        ? GROUP_BOLETO_RETURN_TEXT.office(documentNumber)
        : GROUP_BOLETO_RETURN_TEXT.overdue(documentNumber)
    send = () => dependencies.sender.sendText({ body, companyId, number: groupJid })
  }

  // Toma o aviso antes de chamar o Evolution: a outra passada perde pela versão e não manda de novo.
  const at = now.toISOString()
  const attempts = (candidate.state.attempts ?? 0) + 1
  const taken: BoletoReturnState = {
    ...candidate.state,
    attempts,
    notices: { ...candidate.state.notices, [candidate.notice]: at },
    ...(outcome === undefined ? {} : { outcome }),
    status: 'sent',
  }
  if (!(await settle(dependencies.runner, candidate, taken))) return 'skipped'

  try {
    await send()
  } catch {
    // Não saiu: devolve o aviso para a próxima passada, ou desiste depois das tentativas.
    const [current] = await rowsOf(
      dependencies.runner,
      sql`select version::text as version from whatsapp_group_requests
           where company_id = ${companyId}::uuid and id = ${candidate.requestId}::uuid`,
    )
    const version = text(current, 'version')
    if (version !== null) {
      await settle(
        dependencies.runner,
        { ...candidate, version },
        {
          attempts,
          lastFailedAt: at,
          notices: candidate.state.notices ?? {},
          ...(candidate.state.outcome === undefined ? {} : { outcome: candidate.state.outcome }),
          ...(attempts >= GROUP_BOLETO_RETURN_MAX_ATTEMPTS ? { status: 'failed' as const } : {}),
        },
      )
    }
    return 'failed'
  }
  return 'sent'
}
