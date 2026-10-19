/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T4.3 (ADR-0110 §13, D14): publica os cinco modelos `.html` do e-mail de ocorrência no módulo de
 * notificação. O arquivo é a fonte e o banco recebe versões — nunca `UPDATE`. O plano é `create` (sem ativa),
 * `same` (ativa igual, assunto e corpo) ou `differs` (ativa diferente: só com `--overwrite <chave>`, para não
 * apagar personalização feita na tela sem aviso). Um arquivo inválido recusa todos.
 */
import { readdirSync, readFileSync } from 'node:fs'

import {
  assessContractorTemplate,
  type ContractorTemplateProblem,
} from '../domain/occurrence-contractor-template.policy.js'

export const OCCURRENCE_MAIL_TEMPLATE_CHANNEL = 'email'
export const OCCURRENCE_MAIL_TEMPLATE_LOCALE = 'pt-BR'

const TEMPLATES_DIR = new URL('../occurrence-mail-templates/', import.meta.url)
const KEY_PREFIX = 'ocorrencia.'
const SUBJECT_LINE_REGEX = /^<!-- subject: (.+) -->\r?\n/u
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export type OccurrenceMailTemplateContent = {
  readonly body: string
  readonly subject: string
}

export type OccurrenceMailTemplateFile = OccurrenceMailTemplateContent & { readonly key: string }

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
  readonly key: string
  readonly verdict: PublicationVerdict
  /** Só preenchida quando a rodada gravou esta chave. */
  readonly writtenVersion?: number
}

export type PublicationPlan = {
  readonly entries: readonly PublicationEntry[]
  readonly invalid: readonly {
    readonly key: string
    readonly problems: readonly ContractorTemplateProblem[]
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
      key: template.key,
      problems: assessContractorTemplate({ key: template.key, template }),
    }))
    .filter((item) => item.problems.length > 0)
  if (invalid.length > 0) return { entries: [], invalid }

  return {
    entries: templates.map((template) => {
      const current = active.get(template.key)
      const verdict: PublicationVerdict =
        current === undefined
          ? 'create'
          : current.body === template.body && (current.subject ?? '') === template.subject
            ? 'same'
            : 'differs'
      return { activeVersion: current?.version ?? null, key: template.key, verdict }
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
      template.key,
      await repository.findActive({
        channel: OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
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
    const template = templates.find((candidate) => candidate.key === entry.key)
    if (!shouldWrite || template === undefined) {
      entries.push(entry)
      continue
    }
    const row = await repository.upsert({
      active: true,
      body: template.body,
      channel: OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
      companyId,
      key: template.key,
      locale: OCCURRENCE_MAIL_TEMPLATE_LOCALE,
      subject: template.subject,
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
