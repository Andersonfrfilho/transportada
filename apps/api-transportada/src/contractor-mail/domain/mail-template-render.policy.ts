/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 RF12/RF14: validação e renderização puras dos modelos de e-mail. `{nome}` é variável;
 * não há escape de chave — `{` e `}` soltos são recusados ao salvar, para o texto nunca sair com um
 * pedaço de variável quebrada.
 */
import {
  MAIL_TEMPLATE_CATALOG,
  type ContractorMailTemplateType,
  type MailTemplateContent,
} from './mail-template-catalog.constant.js'

export type MailTemplateFieldName = keyof MailTemplateContent

export type MailTemplateFieldError = {
  readonly field: MailTemplateFieldName
  readonly message: string
}

export type ValidateMailTemplateParams = {
  readonly content: MailTemplateContent
  readonly mailType: ContractorMailTemplateType
}

export type RenderMailTemplateParams = {
  readonly format: 'html' | 'text'
  readonly text: string
  readonly values: Readonly<Record<string, string>>
}

type TemplateToken =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'variable'; readonly name: string }

const VARIABLE_NAME = /^[a-z_]+$/u
const FIELD_ORDER: readonly MailTemplateFieldName[] = ['subject', 'intro', 'itemText', 'closing']
const ITEM_FIELD: MailTemplateFieldName = 'itemText'

/** Todos os erros de uma vez, por campo (padrão de API: `details[]` completo, não o primeiro). */
export function validateMailTemplate(
  params: ValidateMailTemplateParams,
): readonly MailTemplateFieldError[] {
  const catalog = MAIL_TEMPLATE_CATALOG[params.mailType]
  const mailNames = new Set(catalog.mailVariables.map((variable) => variable.name))
  const itemNames = new Set(catalog.itemVariables.map((variable) => variable.name))

  return FIELD_ORDER.flatMap((field) => {
    const tokens = tokenizeTemplate(params.content[field])
    if (tokens === undefined) return [{ field, message: 'has an unmatched { or }' }]

    const messages = tokens.flatMap((token) => {
      if (token.kind === 'text') return []
      if (itemNames.has(token.name)) {
        return field === ITEM_FIELD
          ? []
          : [`{${token.name}} is an item variable and is only allowed in itemText`]
      }
      if (mailNames.has(token.name)) return []
      return [`{${token.name}} is not a variable of ${params.mailType}`]
    })
    return [...new Set(messages)].map((message) => ({ field, message }))
  })
}

/**
 * `html` escapa o texto inteiro depois de substituir — o valor vem de XML de terceiro (RF12) e o
 * texto fixo foi digitado pelo operador: nenhum dos dois pode virar marcação. `text` sai literal.
 * Variável que o catálogo não conhece fica como veio (a validação já a recusou ao salvar).
 */
export function renderMailTemplate(params: RenderMailTemplateParams): string {
  const tokens = tokenizeTemplate(params.text)
  const rendered =
    tokens === undefined
      ? params.text
      : tokens
          .map((token) =>
            token.kind === 'text' ? token.value : (params.values[token.name] ?? `{${token.name}}`),
          )
          .join('')
  return params.format === 'html' ? escapeMailHtml(rendered) : rendered
}

/** `&` sempre primeiro: escapar os outros antes duplicaria o `&amp;` que eles introduzem. */
export function escapeMailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** `undefined` quando alguma chave está solta ou o nome entre chaves não tem forma de variável. */
function tokenizeTemplate(text: string): readonly TemplateToken[] | undefined {
  const tokens: TemplateToken[] = []
  let cursor = 0
  while (cursor < text.length) {
    const open = text.indexOf('{', cursor)
    const close = text.indexOf('}', cursor)
    if (open === -1) {
      if (close !== -1) return undefined
      tokens.push({ kind: 'text', value: text.slice(cursor) })
      break
    }
    if (close !== -1 && close < open) return undefined
    const end = text.indexOf('}', open)
    const nextOpen = text.indexOf('{', open + 1)
    if (end === -1 || (nextOpen !== -1 && nextOpen < end)) return undefined
    const name = text.slice(open + 1, end)
    if (!VARIABLE_NAME.test(name)) return undefined
    if (open > cursor) tokens.push({ kind: 'text', value: text.slice(cursor, open) })
    tokens.push({ kind: 'variable', name })
    cursor = end + 1
  }
  return tokens
}
