/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF1–RF3, RF5): o texto do boleto ao cliente sai do modelo do módulo de notificação que o tipo da
 * ocorrência escolheu **no canal** (`company_occurrence_type_client_channels.template_key`, a versão ativa mais alta,
 * `pt-BR`), com a sintaxe do módulo (`{{camelCase}}`, lista fechada em `CONTRACTOR_REPLY_CLIENT_TEMPLATE_VARIABLES`).
 *
 * Leitura tolerante enquanto a etapa B (T9) não tira os campos antigos: tipo sem linha do canal, ou com a caixa sem
 * modelo escolhido, usa o texto livre copiado no retorno (`forwardEmailSubject`/`forwardEmailBody`, como antes da 286).
 * Canal com modelo escolhido que não existe mais (ou ficou vazio) é `template_missing`: aquele canal não sai, e quem
 * chamou deixa o motivo na linha do tempo (ADR-0108: sem modelo utilizável não sai mensagem).
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-parity.contract.ts` do worker compara os dois arquivos. Nenhum log aqui.
 */
import { interpolateTemplate } from '@adatechnology/notification-contracts'
import { sql, type SQL } from 'drizzle-orm'

export type ContractorReplyClientTemplateRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

export type ContractorReplyClientChannel = 'email' | 'whatsapp'

/** A caixa do canal no tipo; `null` quando o tipo não tem a linha (gravado antes da 286). */
export type ContractorReplyClientChannelSetting = {
  readonly enabled: boolean
  readonly sendMode: string
  readonly templateKey: null | string
}

/** No WhatsApp o assunto é vazio: a legenda do PDF é só o corpo. */
export type ContractorReplyClientTexts = { readonly body: string; readonly subject: string }

export type ResolveContractorReplyClientTextsResult =
  | {
      readonly kind: 'texts'
      readonly source: 'legacy' | 'template'
      readonly texts: ContractorReplyClientTexts
    }
  /** `legacy`: o tipo não escolheu modelo (sem fallback para o texto antigo, spec 286 T9); `template`: o modelo escolhido não serve. */
  | { readonly kind: 'template_missing'; readonly source: 'legacy' | 'template' }

/** As variáveis que o modelo do boleto ao cliente pode usar; a que falta sai vazia (regra do módulo). */
export const CONTRACTOR_REPLY_CLIENT_TEMPLATE_VARIABLES = [
  'nomeExibicao',
  'numeroNota',
  'numeroNotaSemSerie',
  'razaoSocial',
  'tipoOcorrencia',
] as const

type Row = Record<string, unknown>

const NOTIFICATION_TEMPLATES = 'notification.templates'
const TEMPLATE_LOCALE = 'pt-BR'
const RECIPIENT_ROLE = 'recipient'
const WHITESPACE_RUN = /\s+/gu

async function rowsOf(
  runner: ContractorReplyClientTemplateRunner,
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

/** A caixa do canal no tipo da ocorrência. */
export async function readContractorReplyClientChannel(
  runner: ContractorReplyClientTemplateRunner,
  params: {
    readonly channel: ContractorReplyClientChannel
    readonly companyId: string
    readonly occurrenceId: string
  },
): Promise<ContractorReplyClientChannelSetting | null> {
  const [row] = await rowsOf(
    runner,
    sql`select setting.enabled, setting.send_mode, setting.template_key
        from trip_document_occurrences occurrence
        join company_occurrence_type_client_channels setting
          on setting.company_id = occurrence.company_id
         and setting.occurrence_type_id = occurrence.occurrence_type_id
         and setting.channel = ${params.channel}
        where occurrence.company_id = ${params.companyId}::uuid
          and occurrence.id = ${params.occurrenceId}::uuid`,
  )
  if (row === undefined) return null
  const templateKey = text(row, 'template_key')
  return {
    enabled: row.enabled === true,
    sendMode: text(row, 'send_mode') ?? 'manual',
    templateKey: templateKey === null || templateKey.trim() === '' ? null : templateKey,
  }
}

async function readValues(
  runner: ContractorReplyClientTemplateRunner,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<Readonly<Record<string, string>>> {
  const [row] = await rowsOf(
    runner,
    sql`select note.number, note.series, recipient.legal_name as recipient_name,
               occurrence_type.name as type_name,
               profile.trade_name, profile.legal_name, profile.display_name_mode
        from trip_document_occurrences occurrence
        left join company_occurrence_types occurrence_type
          on occurrence_type.company_id = occurrence.company_id
         and occurrence_type.id = occurrence.occurrence_type_id
        left join trip_documents document
          on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
        left join nfe_documents note
          on note.company_id = document.company_id and note.id = document.nfe_document_id
        left join nfe_participants recipient
          on recipient.company_id = note.company_id and recipient.document_id = note.id
         and recipient.role = ${RECIPIENT_ROLE}
        left join company_fiscal_profiles profile on profile.company_id = occurrence.company_id
        where occurrence.company_id = ${params.companyId}::uuid
          and occurrence.id = ${params.occurrenceId}::uuid`,
  )
  const number = (text(row, 'number') ?? '').trim()
  const series = (text(row, 'series') ?? '').trim()
  return {
    nomeExibicao: chosenCarrierName({
      displayNameMode: text(row, 'display_name_mode'),
      legalName: text(row, 'legal_name') ?? '',
      tradeName: text(row, 'trade_name') ?? '',
    }),
    numeroNota: number === '' ? '' : series === '' ? number : `${number}/${series}`,
    numeroNotaSemSerie: number,
    razaoSocial: (text(row, 'recipient_name') ?? '').trim(),
    tipoOcorrencia: (text(row, 'type_name') ?? '').trim(),
  }
}

/**
 * O assunto e o corpo do boleto ao cliente no canal, já com as variáveis. A escolha do modelo é do tipo **agora**
 * (não a cópia do retorno): trocar o modelo em Notificações vale para o próximo envio, sem deploy.
 */
export async function resolveContractorReplyClientTexts(
  runner: ContractorReplyClientTemplateRunner,
  params: {
    readonly channel: ContractorReplyClientChannel
    readonly companyId: string
    readonly occurrenceId: string
  },
): Promise<ResolveContractorReplyClientTextsResult> {
  const { channel, companyId, occurrenceId } = params
  const setting = await readContractorReplyClientChannel(runner, {
    channel,
    companyId,
    occurrenceId,
  })
  if (setting === null || setting.templateKey === null)
    return { kind: 'template_missing', source: 'legacy' }

  const [template] = await rowsOf(
    runner,
    sql`select subject, body from ${sql.raw(NOTIFICATION_TEMPLATES)}
        where company_id = ${companyId}::uuid and key = ${setting.templateKey}
          and channel = ${channel} and locale = ${TEMPLATE_LOCALE} and active
        order by version desc
        limit 1`,
  )
  if (template === undefined) return { kind: 'template_missing', source: 'template' }
  const values = await readValues(runner, { companyId, occurrenceId })
  const body = interpolateTemplate(text(template, 'body') ?? '', values).trim()
  const subject =
    channel === 'email'
      ? interpolateTemplate(text(template, 'subject') ?? '', values)
          .replace(WHITESPACE_RUN, ' ')
          .trim()
      : ''
  if (body === '' || (channel === 'email' && subject === '')) {
    return { kind: 'template_missing', source: 'template' }
  }
  return { kind: 'texts', source: 'template', texts: { body, subject } }
}
