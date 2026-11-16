/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3: quando um modelo das contas (`contas.*`) serve. Mesma régua da 272/286 (HTML seguro, área de mensagem,
 * assunto, variáveis da lista fechada), com a lista de cada modelo. Pura; devolve todos os problemas de uma vez. O
 * publicador recusa o arquivo com qualquer problema; no envio (T7.4) só o que faz o modelo não existir bloqueia.
 */
import { extractTemplatePlaceholders } from '@adatechnology/notification-contracts'

import { HTML_BODY_REGEX } from '../../occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  findMessageArea,
  findUnsafeHtmlRules,
} from '../../occurrence-conversation/domain/occurrence-mail-html-safety.policy.js'
import {
  EXPENSE_MAIL_TEMPLATE_RULES,
  EXPENSE_WHATSAPP_TEMPLATE_RULES,
  type ExpenseTemplateRules,
} from './expense-reminder-mail-template.constant.js'

export type ExpenseTemplateProblem =
  | { readonly code: 'empty_body' }
  | { readonly code: 'empty_subject' }
  | { readonly code: 'html_not_allowed' }
  | { readonly code: 'malformed_placeholder' }
  | { readonly code: 'missing_message_area' }
  | { readonly code: 'not_found' }
  | { readonly code: 'unknown_key' }
  | { readonly code: 'unknown_variables'; readonly variables: readonly string[] }
  | { readonly code: 'unsafe_html' }

export type ExpenseTemplateContent = {
  readonly body: string
  readonly subject: string
}

/** Uma `{{` que o renderizador não casa (`{{ nome }}` com espaço vale; `{{nome}` não): sairia o marcador cru. */
const MALFORMED_PLACEHOLDER_REGEX = /\{\{(?!\s*[A-Za-z0-9_]+\s*\}\})/u

const SEND_BLOCKING_CODES: ReadonlySet<ExpenseTemplateProblem['code']> = new Set([
  'empty_body',
  'empty_subject',
  'missing_message_area',
  'not_found',
  'unknown_key',
  'unsafe_html',
])

function findUnknownVariables(texts: readonly string[], rules: ExpenseTemplateRules): string[] {
  const allowed = new Set([...rules.text.map((variable) => variable.name), ...rules.systemHtml])
  return [
    ...new Set(
      texts
        .flatMap((text) => extractTemplatePlaceholders(text))
        .filter((name) => !allowed.has(name)),
    ),
  ]
}

/** HTML do sistema dentro da área de mensagem sairia escapado na edição: é o mesmo `unsafe_html` da 272 (§12). */
function hasSystemHtmlInMessageArea(body: string, rules: ExpenseTemplateRules): boolean {
  const area = findMessageArea(body)
  if (area === undefined || rules.systemHtml.length === 0) return false
  const pattern = new RegExp(`\\{\\{\\s*(?:${rules.systemHtml.join('|')})\\s*\\}\\}`, 'u')
  return pattern.test(body.slice(area.start, area.end))
}

/** O e-mail (HTML) de uma chave `contas.*`. `null` = a chave não tem versão ativa. */
export function assessExpenseMailTemplate(input: {
  readonly key: string
  readonly template: ExpenseTemplateContent | null
}): readonly ExpenseTemplateProblem[] {
  const rules = EXPENSE_MAIL_TEMPLATE_RULES[input.key]
  if (rules === undefined) return [{ code: 'unknown_key' }]
  const { template } = input
  if (template === null) return [{ code: 'not_found' }]
  const isHtml = HTML_BODY_REGEX.test(template.body)
  const unknownVariables = findUnknownVariables([template.subject, template.body], rules)
  const hasMalformedPlaceholder = [template.subject, template.body].some((text) =>
    MALFORMED_PLACEHOLDER_REGEX.test(text),
  )
  const unsafe =
    isHtml &&
    (findUnsafeHtmlRules(template.body).length > 0 ||
      hasSystemHtmlInMessageArea(template.body, rules))
  return [
    ...(isHtml && findMessageArea(template.body) !== undefined
      ? []
      : [{ code: 'missing_message_area' } as const]),
    ...(unsafe ? [{ code: 'unsafe_html' } as const] : []),
    ...(template.subject.trim() === '' ? [{ code: 'empty_subject' } as const] : []),
    ...(unknownVariables.length > 0
      ? [{ code: 'unknown_variables', variables: unknownVariables } as const]
      : []),
    ...(hasMalformedPlaceholder ? [{ code: 'malformed_placeholder' } as const] : []),
  ]
}

/** O texto do WhatsApp de uma chave `contas.*`: sem HTML, sem assunto, só as variáveis de texto. */
export function assessExpenseWhatsappTemplate(input: {
  readonly body: string | null
  readonly key: string
}): readonly ExpenseTemplateProblem[] {
  const rules = EXPENSE_WHATSAPP_TEMPLATE_RULES[input.key]
  if (rules === undefined) return [{ code: 'unknown_key' }]
  if (input.body === null) return [{ code: 'not_found' }]
  const { body } = input
  const unknownVariables = findUnknownVariables([body], rules)
  return [
    ...(body.trim() === '' ? [{ code: 'empty_body' } as const] : []),
    ...(HTML_BODY_REGEX.test(body) ? [{ code: 'html_not_allowed' } as const] : []),
    ...(MALFORMED_PLACEHOLDER_REGEX.test(body) ? [{ code: 'malformed_placeholder' } as const] : []),
    ...(unknownVariables.length > 0
      ? [{ code: 'unknown_variables', variables: unknownVariables } as const]
      : []),
  ]
}

/** No envio, variável desconhecida sai vazia e não bloqueia; o que faz o modelo não existir bloqueia. */
export function blocksExpenseTemplateSend(problems: readonly ExpenseTemplateProblem[]): boolean {
  return problems.some((problem) => SEND_BLOCKING_CODES.has(problem.code))
}
