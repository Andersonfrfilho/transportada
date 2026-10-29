/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (T6, RF6): quando o modelo `correcao-endereco.padrao` do módulo de notificação serve ao e-mail de
 * correção de endereço. Pura: devolve todos os problemas de uma vez. Mesma régua da 271/272 (`assessContractorTemplate`),
 * com a lista fechada de variáveis deste e-mail.
 */
import { extractTemplatePlaceholders } from '@adatechnology/notification-contracts'

import { HTML_BODY_REGEX } from '../../occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  findMessageArea,
  findUnsafeHtmlRules,
} from '../../occurrence-conversation/domain/occurrence-mail-html-safety.policy.js'
import {
  ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES,
  ADDRESS_CORRECTION_MAIL_VARIABLE_NAMES,
} from './address-correction-mail-template.constant.js'

export type AddressCorrectionTemplateProblem =
  | { readonly code: 'empty_subject' }
  | { readonly code: 'malformed_placeholder' }
  | { readonly code: 'missing_message_area' }
  | { readonly code: 'not_found' }
  | { readonly code: 'unknown_variables'; readonly variables: readonly string[] }
  | { readonly code: 'unsafe_html' }

export type AddressCorrectionTemplateContent = {
  readonly body: string
  readonly subject: string
}

/** Uma `{{` que o renderizador do módulo não casa (`{{ nome }}`): o texto sairia com o marcador cru. */
const MALFORMED_PLACEHOLDER_REGEX = /\{\{(?!\s*[A-Za-z0-9_]+\s*\}\})/u
const SYSTEM_HTML_IN_AREA_REGEX = new RegExp(
  `\\{\\{\\s*(?:${ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES.join('|')})\\s*\\}\\}`,
  'u',
)

const SEND_BLOCKING_CODES: ReadonlySet<AddressCorrectionTemplateProblem['code']> = new Set([
  'empty_subject',
  'missing_message_area',
  'not_found',
  'unsafe_html',
])

function findUnknownVariables(template: AddressCorrectionTemplateContent): readonly string[] {
  return [
    ...new Set(
      [template.subject, template.body]
        .flatMap((text) => extractTemplatePlaceholders(text))
        .filter((name) => !ADDRESS_CORRECTION_MAIL_VARIABLE_NAMES.has(name)),
    ),
  ]
}

/** HTML inseguro (ADR-0110 §2) ou a chave de HTML do sistema dentro da área de mensagem (§12). */
function hasUnsafeHtml(body: string): boolean {
  if (findUnsafeHtmlRules(body).length > 0) return true
  const area = findMessageArea(body)
  return area !== undefined && SYSTEM_HTML_IN_AREA_REGEX.test(body.slice(area.start, area.end))
}

export function assessAddressCorrectionTemplate(
  template: AddressCorrectionTemplateContent | null,
): readonly AddressCorrectionTemplateProblem[] {
  if (template === null) return [{ code: 'not_found' }]
  const unknownVariables = findUnknownVariables(template)
  const hasMalformedPlaceholder = [template.subject, template.body].some((text) =>
    MALFORMED_PLACEHOLDER_REGEX.test(text),
  )
  /** O layout é do modelo (ADR-0110): corpo sem HTML não tem a moldura nem a área de mensagem. */
  const isHtml = HTML_BODY_REGEX.test(template.body)
  return [
    ...(isHtml ? [] : [{ code: 'missing_message_area' } as const]),
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

/** No envio, só o que faz o modelo não existir bloqueia: variável desconhecida sai vazia. */
export function blocksAddressCorrectionMailSend(
  problems: readonly AddressCorrectionTemplateProblem[],
): boolean {
  return problems.some((problem) => SEND_BLOCKING_CODES.has(problem.code))
}
