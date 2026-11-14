/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T4.3 (ADR-0110 §13, D14): publica os cinco modelos `.html` do e-mail de ocorrência no módulo de
 * notificação. A spec 286 (T6) soma o modelo `correcao-endereco.padrao`, com a régua dele (lista fechada própria). O arquivo é a fonte e o banco recebe versões — nunca `UPDATE`. O plano é `create` (sem ativa),
 * `same` (ativa igual, assunto e corpo) ou `differs` (ativa diferente: só com `--overwrite <chave>`, para não
 * apagar personalização feita na tela sem aviso). Um arquivo inválido recusa todos.
 *
 * Spec 324 (T1b, D10): o modelo geral do aviso manual à contratante tem também a versão WhatsApp da mesma chave
 * (`occurrence-whatsapp-templates/*.txt`, sem assunto). Cada modelo diz o canal; o plano o mostra ao lado da chave.
 *
 * Spec 325 (T7.3): os modelos das contas (`contas.aviso-vencimento` em e-mail e WhatsApp, `contas.resumo-diario` em
 * e-mail) entram na mesma publicação, com a régua deles (`expense-reminder-mail-template.policy.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs'

import { ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY } from '../../address-correction/domain/address-correction-mail-template.constant.js'
import { assessAddressCorrectionTemplate } from '../../address-correction/domain/address-correction-mail-template.policy.js'
import { EXPENSE_TEMPLATE_KEY_PREFIX } from '../../expenses/domain/expense-reminder-mail-template.constant.js'
import {
  assessExpenseMailTemplate,
  assessExpenseWhatsappTemplate,
} from '../../expenses/domain/expense-reminder-mail-template.policy.js'
import {
  assessManualNoticeEmailTemplate,
  assessManualNoticeWhatsappTemplate,
  CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
} from '../domain/contractor-manual-notice-template.policy.js'
import { assessContractorTemplate } from '../domain/occurrence-contractor-template.policy.js'

export const OCCURRENCE_MAIL_TEMPLATE_CHANNEL = 'email'
export const OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL = 'whatsapp'
export const OCCURRENCE_MAIL_TEMPLATE_LOCALE = 'pt-BR'

const TEMPLATES_DIR = new URL('../occurrence-mail-templates/', import.meta.url)
const WHATSAPP_TEMPLATES_DIR = new URL('../occurrence-whatsapp-templates/', import.meta.url)
const ADDRESS_CORRECTION_TEMPLATE_FILE = new URL(
  '../../address-correction/address-correction-mail-templates/correcao-endereco.html',
  import.meta.url,
)
const EXPENSE_MAIL_TEMPLATES_DIR = new URL(
  '../../expenses/expense-mail-templates/',
  import.meta.url,
)
const EXPENSE_WHATSAPP_TEMPLATES_DIR = new URL(
  '../../expenses/expense-whatsapp-templates/',
  import.meta.url,
)
const KEY_PREFIX = 'ocorrencia.'
const SUBJECT_LINE_REGEX = /^<!-- subject: (.+) -->\r?\n/u
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export type OccurrenceMailTemplateContent = {
  readonly body: string
  readonly subject: string
}

export type OccurrenceTemplateChannel =
  | typeof OCCURRENCE_MAIL_TEMPLATE_CHANNEL
  | typeof OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL

export type OccurrenceMailTemplateFile = OccurrenceMailTemplateContent & {
  /** Ausente é `email`, o canal de todos os modelos até a spec 324. */
  readonly channel?: OccurrenceTemplateChannel
  readonly key: string
}

type ActiveTemplate = {
  readonly body: string
  readonly subject: null | string
  readonly version: number
}

/** O recorte do `TemplateRepository` do módulo de notificação que o publicador usa. */
export type OccurrenceMailTemplatePublishRepository = {
  readonly findActive: (params: {
    channel: string
    companyId: string
    key: string
    locale: string
  }) => Promise<ActiveTemplate | undefined>
  readonly upsert: (params: {
    active: boolean
    body: string
    channel: string
    companyId: string
    key: string
    locale: string
    subject?: string
  }) => Promise<{ readonly version: number }>
}

export type PublicationVerdict = 'create' | 'differs' | 'same'

export type PublicationEntry = {
  readonly activeVersion: null | number
  readonly channel: OccurrenceTemplateChannel
  readonly key: string
  readonly verdict: PublicationVerdict
  /** Só preenchida quando a rodada gravou esta chave. */
  readonly writtenVersion?: number
}

export type PublicationProblem = { readonly code: string }

export type PublicationPlan = {
  readonly entries: readonly PublicationEntry[]
  readonly invalid: readonly {
    readonly key: string
    readonly problems: readonly PublicationProblem[]
  }[]
}

/** A linha 1 é `<!-- subject: … -->`; o assunto sai dela e só o resto é o corpo (é o que o módulo recebe). */
export function parseTemplateFile(file: string): OccurrenceMailTemplateContent {
  const match = SUBJECT_LINE_REGEX.exec(file)
  if (match === null) throw new Error('primeira linha sem <!-- subject: … -->')
  return { body: file.slice(match[0].length), subject: match[1] ?? '' }
}

export function readOccurrenceMailTemplateFiles(): readonly OccurrenceMailTemplateFile[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => ({
      ...parseTemplateFile(readFileSync(new URL(name, TEMPLATES_DIR), 'utf8')),
      key: `${KEY_PREFIX}${name.slice(0, -'.html'.length)}`,
    }))
}

/** Spec 286 (T6): o modelo da correção de endereço, junto dos de ocorrência na mesma publicação. */
export function readAddressCorrectionMailTemplateFile(): OccurrenceMailTemplateFile {
  return {
    ...parseTemplateFile(readFileSync(ADDRESS_CORRECTION_TEMPLATE_FILE, 'utf8')),
    key: ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY,
  }
}

/** Spec 324 (T1b): os textos WhatsApp versionados (hoje só o do aviso manual), chave `ocorrencia.<arquivo>`. */
export function readOccurrenceWhatsappTemplateFiles(): readonly OccurrenceMailTemplateFile[] {
  return readdirSync(WHATSAPP_TEMPLATES_DIR)
    .filter((name) => name.endsWith('.txt'))
    .sort()
    .map((name) => ({
      body: readFileSync(new URL(name, WHATSAPP_TEMPLATES_DIR), 'utf8').trimEnd(),
      channel: OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL,
      key: `${KEY_PREFIX}${name.slice(0, -'.txt'.length)}`,
      subject: '',
    }))
}

/** Spec 325 (T7.3): os modelos das contas, e-mail e WhatsApp, chave `contas.<arquivo>`. */
export function readExpenseTemplateFiles(): readonly OccurrenceMailTemplateFile[] {
  const mail = readdirSync(EXPENSE_MAIL_TEMPLATES_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => ({
      ...parseTemplateFile(readFileSync(new URL(name, EXPENSE_MAIL_TEMPLATES_DIR), 'utf8')),
      key: `${EXPENSE_TEMPLATE_KEY_PREFIX}${name.slice(0, -'.html'.length)}`,
    }))
  const whatsapp = readdirSync(EXPENSE_WHATSAPP_TEMPLATES_DIR)
    .filter((name) => name.endsWith('.txt'))
    .sort()
    .map((name) => ({
      body: readFileSync(new URL(name, EXPENSE_WHATSAPP_TEMPLATES_DIR), 'utf8').trimEnd(),
      channel: OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL,
      key: `${EXPENSE_TEMPLATE_KEY_PREFIX}${name.slice(0, -'.txt'.length)}`,
      subject: '',
    }))
  return [...mail, ...whatsapp]
}

function channelOf(template: OccurrenceMailTemplateFile): OccurrenceTemplateChannel {
  return template.channel ?? OCCURRENCE_MAIL_TEMPLATE_CHANNEL
}

/** A posição do modelo no mapa da versão ativa: a chave, e o canal quando não é e-mail (a mesma chave em dois canais). */
export function templateSlot(template: OccurrenceMailTemplateFile): string {
  const channel = channelOf(template)
  return channel === OCCURRENCE_MAIL_TEMPLATE_CHANNEL ? template.key : `${channel}:${template.key}`
}

/** Cada família de modelo tem a sua régua de variáveis. */
function assessTemplateFile(template: OccurrenceMailTemplateFile): readonly PublicationProblem[] {
  if (template.key.startsWith(EXPENSE_TEMPLATE_KEY_PREFIX)) {
    return channelOf(template) === OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL
      ? assessExpenseWhatsappTemplate({ body: template.body, key: template.key })
      : assessExpenseMailTemplate({ key: template.key, template })
  }
  if (channelOf(template) === OCCURRENCE_WHATSAPP_TEMPLATE_CHANNEL) {
    return assessManualNoticeWhatsappTemplate(template)
  }
  if (template.key === ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY) {
    return assessAddressCorrectionTemplate(template)
  }
  const problems = assessContractorTemplate({ key: template.key, template })
  return template.key === CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY
    ? [...problems, ...assessManualNoticeEmailTemplate(template)]
    : problems
}

export function planOccurrenceMailTemplatePublication(params: {
  readonly active: ReadonlyMap<string, ActiveTemplate | undefined>
  readonly overwrite: readonly string[]
  readonly templates: readonly OccurrenceMailTemplateFile[]
}): PublicationPlan {
  const { active, overwrite, templates } = params
  const unknown = overwrite.filter((key) => !templates.some((template) => template.key === key))
  if (unknown.length > 0)
    throw new Error(`--overwrite com chave desconhecida: ${unknown.join(', ')}`)

  const invalid = templates
    .map((template) => ({
      key: templateSlot(template),
      problems: assessTemplateFile(template),
    }))
    .filter((item) => item.problems.length > 0)
  if (invalid.length > 0) return { entries: [], invalid }

  return {
    entries: templates.map((template) => {
      const current = active.get(templateSlot(template))
      const verdict: PublicationVerdict =
        current === undefined
          ? 'create'
          : current.body === template.body && (current.subject ?? '') === template.subject
            ? 'same'
            : 'differs'
      return {
        activeVersion: current?.version ?? null,
        channel: channelOf(template),
        key: template.key,
        verdict,
      }
    }),
    invalid: [],
  }
}

/** Sem `confirm` só devolve o plano; com `confirm` grava `create` e os `differs` pedidos em `overwrite`. */
export async function publishOccurrenceMailTemplates(params: {
  readonly companyId: string
  readonly confirm: boolean
  readonly overwrite: readonly string[]
  readonly repository: OccurrenceMailTemplatePublishRepository
  readonly templates: readonly OccurrenceMailTemplateFile[]
}): Promise<PublicationPlan> {
  const { companyId, confirm, overwrite, repository, templates } = params
  const active = new Map<string, ActiveTemplate | undefined>()
  for (const template of templates) {
    active.set(
      templateSlot(template),
      await repository.findActive({
        channel: channelOf(template),
        companyId,
        key: template.key,
        locale: OCCURRENCE_MAIL_TEMPLATE_LOCALE,
      }),
    )
  }
  const plan = planOccurrenceMailTemplatePublication({ active, overwrite, templates })
  if (!confirm || plan.invalid.length > 0) return plan

  const entries: PublicationEntry[] = []
  for (const entry of plan.entries) {
    const shouldWrite =
      entry.verdict === 'create' || (entry.verdict === 'differs' && overwrite.includes(entry.key))
    const template = templates.find(
      (candidate) => candidate.key === entry.key && channelOf(candidate) === entry.channel,
    )
    if (!shouldWrite || template === undefined) {
      entries.push(entry)
      continue
    }
    const row = await repository.upsert({
      active: true,
      body: template.body,
      channel: entry.channel,
      companyId,
      key: template.key,
      locale: OCCURRENCE_MAIL_TEMPLATE_LOCALE,
      ...(entry.channel === OCCURRENCE_MAIL_TEMPLATE_CHANNEL ? { subject: template.subject } : {}),
    })
    entries.push({ ...entry, writtenVersion: row.version })
  }
  return { entries, invalid: [] }
}

export type PublishArguments = {
  readonly companyId: string
  readonly confirm: boolean
  readonly overwrite: readonly string[]
}

export function parsePublishArguments(argv: readonly string[]): PublishArguments {
  const valuesOf = (name: string): string[] =>
    argv.flatMap((argument, index) => (argument === `--${name}` ? [argv[index + 1] ?? ''] : []))
  const [companyId] = valuesOf('company')
  if (companyId === undefined || !UUID_REGEX.test(companyId)) {
    throw new Error('--company <uuid> é obrigatório e precisa ser um UUID')
  }
  const overwrite = valuesOf('overwrite')
  if (overwrite.some((key) => key === '' || key.startsWith('--'))) {
    throw new Error('--overwrite exige a chave do modelo')
  }
  return { companyId, confirm: argv.includes('--confirm'), overwrite }
}
