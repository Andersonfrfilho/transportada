/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D3/D4/D5) e 272 (ADR-0110 §2: HTML seguro é utilizável): quando um modelo de e-mail do módulo de notificação serve ao e-mail de
 * ocorrência à contratante. Pura: devolve **todos** os problemas de uma vez, na ordem fixa abaixo; quem lê o
 * banco e quem responde o 400 ficam de fora.
 */
import { extractTemplatePlaceholders } from '@adatechnology/notification-contracts'

import { NOTIFICATION_TEMPLATE_KEY } from '../../notification/domain/notification-catalog.constant.js'
import {
  HTML_BODY_PATTERN,
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES,
} from './occurrence-contractor-mail.constant.js'
import {
  findMessageArea,
  findUnsafeHtmlRules,
  hasSystemHtmlKeyInMessageArea,
} from './occurrence-mail-html-safety.policy.js'

export type ContractorTemplateProblem =
  | { readonly code: 'empty_subject' }
  | { readonly code: 'malformed_placeholder' }
  | { readonly code: 'missing_message_area' }
  | { readonly code: 'not_found' }
  | { readonly code: 'system_key' }
  | { readonly code: 'unsafe_html' }
  | { readonly code: 'unknown_variables'; readonly variables: readonly string[] }

export type ContractorTemplateContent = {
  readonly body: string
  readonly subject: string
}

/** As chaves dos avisos do sistema: variáveis outras, nunca escolhidas para o e-mail à contratante. */
export const SYSTEM_NOTIFICATION_TEMPLATE_KEYS: ReadonlySet<string> = new Set(
  Object.values(NOTIFICATION_TEMPLATE_KEY),
)

const HTML_BODY_REGEX = new RegExp(HTML_BODY_PATTERN, 'u')
/** Uma `{{` que o renderizador do módulo não casa (`{{ nome }}`): o texto sairia com o marcador cru. */
const MALFORMED_PLACEHOLDER_REGEX = /\{\{(?!\s*[A-Za-z0-9_]+\s*\}\})/u

const SEND_BLOCKING_CODES: ReadonlySet<ContractorTemplateProblem['code']> = new Set([
  'empty_subject',
  'missing_message_area',
  'not_found',
  'unsafe_html',
])

function findUnknownVariables(template: ContractorTemplateContent): readonly string[] {
  return [
    ...new Set(
      [template.subject, template.body]
        .flatMap((text) => extractTemplatePlaceholders(text))
        .filter((name) => !OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES.has(name)),
    ),
  ]
}

/** HTML inseguro (ADR-0110 §2) ou chave de HTML do sistema dentro da área de mensagem (§12). */
function hasUnsafeHtml(body: string): boolean {
  return findUnsafeHtmlRules(body).length > 0 || hasSystemHtmlKeyInMessageArea(body)
}

export function assessContractorTemplate(params: {
  readonly key: string
  /** A versão ativa mais alta (e-mail, pt-BR) da chave; `null` é "não existe". */
  readonly template: ContractorTemplateContent | null
}): readonly ContractorTemplateProblem[] {
  const { key, template } = params
  if (template === null) return [{ code: 'not_found' }]
  const unknownVariables = findUnknownVariables(template)
  const hasMalformedPlaceholder = [template.subject, template.body].some((text) =>
    MALFORMED_PLACEHOLDER_REGEX.test(text),
  )
  const isHtml = HTML_BODY_REGEX.test(template.body)
  return [
    ...(SYSTEM_NOTIFICATION_TEMPLATE_KEYS.has(key) ? [{ code: 'system_key' } as const] : []),
    ...(isHtml && hasUnsafeHtml(template.body) ? [{ code: 'unsafe_html' } as const] : []),
    ...(isHtml && findMessageArea(template.body) === undefined
      ? [{ code: 'missing_message_area' } as const]
      : []),
    ...(template.subject.trim() === '' ? [{ code: 'empty_subject' } as const] : []),
    ...(unknownVariables.length > 0
      ? [{ code: 'unknown_variables', variables: unknownVariables } as const]
      : []),
    ...(hasMalformedPlaceholder ? [{ code: 'malformed_placeholder' } as const] : []),
  ]
}

/**
 * No envio, só o que faz o modelo não existir bloqueia (D5): variável desconhecida sai vazia, e a chave de
 * aviso do sistema nunca chega a ser escolhida (a gravação do tipo a recusa).
 */
export function blocksContractorMailSend(problems: readonly ContractorTemplateProblem[]): boolean {
  return problems.some((problem) => SEND_BLOCKING_CODES.has(problem.code))
}

/** O modelo como o editor do tipo o lê: o texto, a versão ativa e se serve (sem problema algum, D5). */
export type ContractorTemplateView = {
  readonly body: string
  readonly key: string
  readonly problems: readonly ContractorTemplateProblem[]
  readonly subject: string
  readonly usable: boolean
  readonly version: number
}

export function toContractorTemplateView(template: {
  readonly body: string
  readonly key: string
  readonly subject: string
  readonly version: number
}): ContractorTemplateView {
  const problems = assessContractorTemplate({ key: template.key, template })
  return { ...template, problems, usable: problems.length === 0 }
}
