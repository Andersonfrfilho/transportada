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
 * disto. Nada de valor no texto do grupo, só o número da nota.
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
/**
 * Só o retorno que **andou há pouco**: a mudança de estado do retorno (o evento em `occurrence_contractor_reply_events`,
 * não o `updated_at`) tem de ser destes minutos e posterior ao pedido do grupo. O que andou antes não vira aviso
 * atrasado no próximo envio. Foram os casos de 04/11: a NF 899884 entregue às 11:27 saiu no grupo às 15:35, e às 20:43
 * uma resposta só da 899884 levou junto os avisos já velhos das 899877 e 899875 (a batida do alarme está pausada em
 * staging, então o que sobrava ia no próximo evento). Uma tentativa que falhou ainda tem esta janela para sair.
 */
export const GROUP_BOLETO_RETURN_FRESH_MINUTES = 30
const BATCH_LIMIT = 50
const DEFAULT_FILE_NAME = 'boleto.pdf'

export const GROUP_BOLETO_RETURN_REQUEST_KEY_PREFIX = 'whatsapp-group-request:'

export type GroupBoletoReturnNotice = 'delivered' | 'office' | 'overdue'

/** O resumo da nota que abre cada aviso ao grupo (pedido do Anderson em 04/11: o mesmo capricho do modelo do cliente). */
export type GroupBoletoReturnSummary = {
  /** Razão social (ou fantasia) do destinatário da nota; vazio quando a nota não traz. */
  readonly clientName: string
  readonly documentNumber: string
  /** Série da nota; vazio quando não se sabe. */
  readonly series: string
  /** O tipo da ocorrência ("Prorrogação do boleto"); vazio quando não se sabe. */
  readonly typeName: string
}

/** "NF `899884/2`", ou "NF `899884`" sem série. */
function noteLabel(summary: GroupBoletoReturnSummary): string {
  return summary.series === ''
    ? `NF \`${summary.documentNumber}\``
    : `NF \`${summary.documentNumber}/${summary.series}\``
}

function summaryLines(summary: GroupBoletoReturnSummary): readonly string[] {
  return [
    ...(summary.clientName === '' ? [] : [`> 🏪 ${summary.clientName}`]),
    ...(summary.typeName === '' ? [] : [`> ⚠️ ${summary.typeName}`]),
  ]
}

const CHECK_BEFORE_PAYING = [
  '✅ *Antes de pagar, o cliente confere:*',
  '💰 o valor · 📅 o vencimento · 🏦 o beneficiário',
] as const

export const GROUP_BOLETO_RETURN_TEXT = {
  clientSent: (summary: GroupBoletoReturnSummary, contacts: readonly string[], resolved = false) =>
    [
      `📄 *Boleto atualizado · ${noteLabel(summary)}*`,
      ...summaryLines(summary),
      '',
      `📨 A contratante respondeu e o boleto já foi enviado ao cliente: ${contacts.map((contact) => `*${contact}*`).join(', ')}.`,
      '',
      ...CHECK_BEFORE_PAYING,
      '',
      closingLine(resolved),
    ].join('\n'),
  document: (summary: GroupBoletoReturnSummary, resolved = false) =>
    [
      `📄 *Boleto atualizado · ${noteLabel(summary)}*`,
      ...summaryLines(summary),
      '',
      '📎 A contratante respondeu. Segue em anexo o boleto atualizado para repassar ao cliente.',
      '',
      ...CHECK_BEFORE_PAYING,
      '',
      closingLine(resolved),
    ].join('\n'),
  office: (summary: GroupBoletoReturnSummary) =>
    [
      `🔎 *${noteLabel(summary)} · a contratante respondeu*`,
      '',
      ...summaryLines(summary),
      '',
      'O escritório vai conferir o arquivo antes de liberar. Assim que liberarem, o boleto vem para cá.',
    ].join('\n'),
  overdue: (summary: GroupBoletoReturnSummary) =>
    [
      `⏳ *${noteLabel(summary)} · o boleto ainda não chegou*`,
      'A contratante não respondeu no prazo, e o escritório já foi avisado.',
      '',
      `➡️ _Para pedir de novo:_ me marque e escreva *pedir boleto de novo ${summary.documentNumber}*`,
    ].join('\n'),
} as const

/** A última linha do aviso do boleto entregue: a ocorrência concluída, ou quem conclui. */
function closingLine(resolved: boolean): string {
  return resolved
    ? '🏁 *Ocorrência concluída.*'
    : '📋 *O escritório conclui a ocorrência.* Precisando de mais alguma coisa, é só me marcar. 🙂'
}

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
  readonly driverId: string
  readonly occurrenceId: string
  readonly groupJid: string
  readonly notice: GroupBoletoReturnNotice
  readonly summary: GroupBoletoReturnSummary
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
  const fresh = new Date(
    params.now.getTime() - GROUP_BOLETO_RETURN_FRESH_MINUTES * 60_000,
  ).toISOString()
  const rows = await rowsOf(
    runner,
    sql`select request.id as request_id, request.company_id, request.group_jid, request.state,
               request.driver_id::text as driver_id, report.result_id::text as occurrence_id,
               request.version::text as version, reply.id as reply_id, reply.status as reply_status,
               coalesce(nullif(request.state->>'documentNumber', ''), note.number, '') as document_number,
               coalesce(note.series, '') as series,
               coalesce(nullif(request.state->>'typeName', ''), kind.name, '') as type_name,
               coalesce(
                 (select coalesce(nullif(participant.legal_name, ''), nullif(participant.trade_name, ''))
                    from nfe_participants participant
                   where participant.company_id = note.company_id and participant.document_id = note.id
                     and participant.role = 'recipient'
                   limit 1),
                 '') as client_name
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
          left join company_occurrence_types kind
            on kind.company_id = occurrence.company_id and kind.id = occurrence.occurrence_type_id
         where request.status = 'completed'
           and request.opened_at >= ${since}::timestamptz
           ${params.companyId === undefined ? sql`` : sql`and request.company_id = ${params.companyId}::uuid`}
           and reply.status in ('delivered', 'needs_operator', 'awaiting_operator', 'overdue')
           -- O retorno andou para o estado de agora há pouco e depois do pedido: aviso velho não pega carona.
           and exists (
                 select 1 from occurrence_contractor_reply_events event
                  where event.company_id = reply.company_id and event.reply_id = reply.id
                    and event.to_status = reply.status
                    and event.created_at >= ${fresh}::timestamptz
                    and event.created_at >= request.opened_at)
           -- Um aviso por ocorrência: só o pedido mais novo do grupo que aponta para ela.
           and not exists (
                 select 1 from whatsapp_group_requests newer
                   join trip_field_reports newer_report
                     on newer_report.company_id = newer.company_id
                    and newer_report.idempotency_key = ${GROUP_BOLETO_RETURN_REQUEST_KEY_PREFIX} || newer.id::text
                  where newer.company_id = request.company_id
                    and newer_report.result_id = report.result_id
                    and newer.opened_at > request.opened_at)
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
    const driverId = text(row, 'driver_id')
    const occurrenceId = text(row, 'occurrence_id')
    if (
      driverId === null ||
      occurrenceId === null ||
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
      driverId,
      occurrenceId,
      groupJid,
      notice,
      summary: {
        clientName: (text(row, 'client_name') ?? '').trim(),
        documentNumber: text(row, 'document_number') ?? '',
        series: (text(row, 'series') ?? '').trim(),
        typeName: (text(row, 'type_name') ?? '').trim(),
      },
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
  // O diálogo do pedido entra na conversa antes do aviso do retorno: a conversa fica na ordem do grupo.
  await syncWhatsAppGroupRequestTranscripts(dependencies.runner, params)
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
  const { companyId, groupJid, summary } = candidate

  let send: () => Promise<unknown>
  /** O texto que fica na conversa da ocorrência (o PDF já está lá, entregue ao motorista). */
  let recorded: string
  let outcome: GroupBoletoReturnState['outcome'] = candidate.state.outcome
  if (candidate.notice === 'delivered') {
    const resolved = await isOccurrenceResolved(dependencies.runner, candidate)
    const deliveries = await clientDeliveriesOf(dependencies.runner, {
      companyId,
      now,
      replyId: candidate.replyId,
    })
    if (deliveries.kind === 'wait') return 'skipped'
    if (deliveries.contacts.length > 0) {
      const body = GROUP_BOLETO_RETURN_TEXT.clientSent(summary, deliveries.contacts, resolved)
      recorded = body
      outcome = 'sent_to_client'
      send = () => dependencies.sender.sendText({ body, companyId, number: groupJid })
    } else {
      outcome = 'posted_to_group'
      const caption = GROUP_BOLETO_RETURN_TEXT.document(summary, resolved)
      recorded = `${caption}\n\n(PDF do boleto enviado no grupo)`
      send = async () => {
        const file = await deliveredFileOf(dependencies, {
          companyId,
          replyId: candidate.replyId,
        })
        if (file === null) throw new Error('GROUP_BOLETO_RETURN_FILE_NOT_FOUND')
        return dependencies.sender.sendDocument({
          bytes: file.bytes,
          caption,
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
        ? GROUP_BOLETO_RETURN_TEXT.office(summary)
        : GROUP_BOLETO_RETURN_TEXT.overdue(summary)
    recorded = body
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
  await recordGroupMessages(dependencies.runner, {
    companyId,
    driverId: candidate.driverId,
    entries: [{ at, key: `return:${candidate.notice}`, text: recorded }],
    occurrenceId: candidate.occurrenceId,
    requestId: candidate.requestId,
  })
  return 'sent'
}

/** O andamento da ocorrência (spec 266): o último evento por `seq` é `resolved`. */
async function isOccurrenceResolved(
  runner: GroupBoletoReturnRunner,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<boolean> {
  const [latest] = await rowsOf(
    runner,
    sql`select kind from trip_occurrence_resolution_events
         where company_id = ${params.companyId}::uuid
           and document_occurrence_id = ${params.occurrenceId}::uuid
         order by seq desc
         limit 1`,
  )
  return text(latest, 'kind') === 'resolved'
}

type GroupConversationEntry = {
  readonly at: string
  /** Único no pedido: a mesma linha copiada duas vezes não duplica (`client_message_id`). */
  readonly key: string
  /** Ausente: o bot. Presente: quem escreveu no grupo (só dígitos). */
  readonly number?: string
  readonly text: string
}

/**
 * Spec 292 T7: o que se falou no grupo vai à conversa do motorista na ocorrência, canal WhatsApp — o bot como enviada
 * automática, o membro como recebida do número dele. Sem conta do motorista não há conversa: nada é gravado.
 */
async function recordGroupMessages(
  runner: GroupBoletoReturnRunner,
  params: {
    readonly companyId: string
    readonly driverId: string
    readonly entries: readonly GroupConversationEntry[]
    readonly occurrenceId: string
    readonly requestId: string
  },
): Promise<void> {
  const { companyId } = params
  if (params.entries.length === 0) return
  const [driver] = await rowsOf(
    runner,
    sql`select membership.user_id::text as user_id
          from fleet_drivers driver
          join user_company_memberships membership
            on membership.company_id = driver.company_id and membership.id = driver.membership_id
           and membership.status = 'active'
          join trip_document_occurrences occurrence
            on occurrence.company_id = driver.company_id and occurrence.id = ${params.occurrenceId}::uuid
         where driver.company_id = ${companyId}::uuid and driver.id = ${params.driverId}::uuid`,
  )
  const driverUserId = text(driver, 'user_id')
  if (driverUserId === null) return
  const [conversation] = await rowsOf(
    runner,
    sql`insert into occurrence_conversations (company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
        values (${companyId}::uuid, 'document', ${params.occurrenceId}::uuid, 'driver', ${driverUserId}::uuid)
        on conflict (company_id, occurrence_kind, occurrence_id, participant)
        do update set driver_user_id = occurrence_conversations.driver_user_id
        returning id`,
  )
  const conversationId = text(conversation, 'id')
  if (conversationId === null) return
  for (const entry of params.entries) {
    const clientMessageId = `whatsapp-group:${params.requestId}:${entry.key}`
    if (entry.number === undefined) {
      await rowsOf(
        runner,
        sql`insert into occurrence_conversation_messages
              (company_id, conversation_id, channel, direction, automatic, body_text, status, status_times,
               client_message_id, created_at)
            values (${companyId}::uuid, ${conversationId}::uuid, 'whatsapp', 'outbound', true, ${entry.text},
                    'sent', ${JSON.stringify({ sent: entry.at })}::jsonb, ${clientMessageId},
                    ${entry.at}::timestamptz)
            on conflict do nothing`,
      )
    } else {
      await rowsOf(
        runner,
        sql`insert into occurrence_conversation_messages
              (company_id, conversation_id, channel, direction, automatic, sender_address, body_text,
               client_message_id, created_at)
            values (${companyId}::uuid, ${conversationId}::uuid, 'whatsapp', 'inbound', false,
                    ${`+${entry.number}`}, ${entry.text}, ${clientMessageId}, ${entry.at}::timestamptz)
            on conflict do nothing`,
      )
    }
  }
}

/**
 * Spec 292 T7: o diálogo do pedido do grupo que abriu a ocorrência (`state.transcript`, gravado pela sessão do pedido)
 * vai à conversa do motorista na ocorrência, do ponto em que parou (`state.transcriptSynced`).
 */
export async function syncWhatsAppGroupRequestTranscripts(
  runner: GroupBoletoReturnRunner,
  params: { readonly companyId?: string; readonly now: Date },
): Promise<number> {
  const since = new Date(
    params.now.getTime() - GROUP_BOLETO_RETURN_LOOKBACK_DAYS * 86_400_000,
  ).toISOString()
  const rows = await rowsOf(
    runner,
    sql`select request.id::text as request_id, request.company_id::text as company_id,
               request.driver_id::text as driver_id, report.result_id::text as occurrence_id,
               request.state->'transcript' as transcript,
               coalesce((request.state->>'transcriptSynced')::int, 0) as synced
          from whatsapp_group_requests request
          join trip_field_reports report
            on report.company_id = request.company_id
           and report.idempotency_key = ${GROUP_BOLETO_RETURN_REQUEST_KEY_PREFIX} || request.id::text
           and report.result_id is not null
          join trip_document_occurrences occurrence
            on occurrence.company_id = report.company_id and occurrence.id = report.result_id
         where request.status = 'completed'
           and request.opened_at >= ${since}::timestamptz
           ${params.companyId === undefined ? sql`` : sql`and request.company_id = ${params.companyId}::uuid`}
           and jsonb_typeof(request.state->'transcript') = 'array'
           and jsonb_array_length(request.state->'transcript') > coalesce((request.state->>'transcriptSynced')::int, 0)
         limit ${BATCH_LIMIT}`,
  )
  let copied = 0
  for (const row of rows) {
    const requestId = text(row, 'request_id')
    const companyId = text(row, 'company_id')
    const driverId = text(row, 'driver_id')
    const occurrenceId = text(row, 'occurrence_id')
    const transcript = Array.isArray(row.transcript) ? (row.transcript as unknown[]) : []
    const synced = Number(row.synced ?? 0)
    if (requestId === null || companyId === null || driverId === null || occurrenceId === null) {
      continue
    }
    const entries: GroupConversationEntry[] = []
    transcript.forEach((item, index) => {
      if (index < synced || typeof item !== 'object' || item === null) return
      const entry = item as Record<string, unknown>
      const body = typeof entry.text === 'string' ? entry.text : ''
      const at = typeof entry.at === 'string' ? entry.at : params.now.toISOString()
      const name = typeof entry.name === 'string' && entry.name !== '' ? entry.name : null
      const number = typeof entry.number === 'string' ? entry.number.replace(/\D/gu, '') : ''
      if (body === '') return
      entries.push(
        entry.from === 'member' && number.length >= 8
          ? {
              at,
              key: `t${index}`,
              number,
              text: name === null ? body : `${name}: ${body}`,
            }
          : { at, key: `t${index}`, text: body },
      )
    })
    await recordGroupMessages(runner, { companyId, driverId, entries, occurrenceId, requestId })
    await rowsOf(
      runner,
      sql`update whatsapp_group_requests
             set state = jsonb_set(state, '{transcriptSynced}', ${String(transcript.length)}::jsonb, true)
           where company_id = ${companyId}::uuid and id = ${requestId}::uuid`,
    )
    copied += entries.length
  }
  return copied
}
