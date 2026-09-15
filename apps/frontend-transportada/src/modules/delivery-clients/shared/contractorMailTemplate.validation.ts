/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CONTRACTOR_MAIL_TEMPLATE_LIMITS,
  MAIL_TEMPLATE_FIELD_NAMES,
  type MailTemplateCatalogEntry,
  type MailTemplateContent,
  type MailTemplateFieldName,
} from './contractorMailTemplates.types'

/**
 * Espelha `mail-template-render.policy.ts#validateMailTemplate` e os tetos de
 * `contractor-mail-templates.schema.ts` (T402) — o servidor continua sendo a verdade; isto é
 * conveniência para o operador não descobrir o erro só depois do `PATCH`.
 */
const VARIABLE_NAME = /^[a-z_]+$/u
const LINE_BREAK = /[\r\n]/u
const ITEM_FIELD: MailTemplateFieldName = 'itemText'

export const MAIL_TEMPLATE_VALIDATION_ERROR = {
  ITEM_VARIABLE_OUTSIDE_ITEM_TEXT: 'itemVariableOutsideItemText',
  NAME_REQUIRED: 'nameRequired',
  NAME_TOO_LONG: 'nameTooLong',
  SUBJECT_HAS_LINE_BREAK: 'subjectHasLineBreak',
  TEXT_REQUIRED: 'textRequired',
  TEXT_TOO_LONG: 'textTooLong',
  UNKNOWN_VARIABLE: 'unknownVariable',
  UNMATCHED_BRACE: 'unmatchedBrace',
} as const
export type MailTemplateValidationError =
  (typeof MAIL_TEMPLATE_VALIDATION_ERROR)[keyof typeof MAIL_TEMPLATE_VALIDATION_ERROR]

export type MailTemplateFieldError = Readonly<{
  field: MailTemplateFieldName
  message: MailTemplateValidationError
}>

type TemplateToken =
  | Readonly<{ kind: 'text'; value: string }>
  | Readonly<{ kind: 'variable'; name: string }>

/**
 * Rodada de correção da Fase 4, item 6: a CHECK do banco (`contractor-mail.schema.ts`) mede
 * `length(name)` — o texto **cru** que fica gravado, não o aparado. O requisito de "obrigatório"
 * ainda olha o aparado (nome só de espaço continua vazio), mas o teto mede o cru, senão o front
 * aceita um valor que o `PATCH` recusa depois.
 */
export function validateMailTemplateName(name: string): MailTemplateValidationError | undefined {
  if (name.trim().length === 0) return MAIL_TEMPLATE_VALIDATION_ERROR.NAME_REQUIRED
  if (name.length > CONTRACTOR_MAIL_TEMPLATE_LIMITS.name) {
    return MAIL_TEMPLATE_VALIDATION_ERROR.NAME_TOO_LONG
  }
  return undefined
}

/**
 * Todos os erros de uma vez, por campo — igual ao servidor (`apis.md` § Validação). `itemText`
 * pode ficar vazio (os blocos de endereço já saem sozinhos); os demais campos são obrigatórios.
 */
export function validateMailTemplateContent(
  input: Readonly<{ catalogEntry: MailTemplateCatalogEntry; content: MailTemplateContent }>,
): readonly MailTemplateFieldError[] {
  const { catalogEntry, content } = input
  const mailNames = new Set(catalogEntry.mailVariables.map((variable) => variable.name))
  const itemNames = new Set(catalogEntry.itemVariables.map((variable) => variable.name))

  return MAIL_TEMPLATE_FIELD_NAMES.flatMap((field) => {
    const raw = content[field]
    const isRequired = field !== ITEM_FIELD
    const limit =
      field === 'subject'
        ? CONTRACTOR_MAIL_TEMPLATE_LIMITS.subject
        : CONTRACTOR_MAIL_TEMPLATE_LIMITS.text

    const errors: MailTemplateFieldError[] = []
    if (isRequired && raw.trim().length === 0) {
      errors.push({ field, message: MAIL_TEMPLATE_VALIDATION_ERROR.TEXT_REQUIRED })
    }
    // Rodada de correção da Fase 4, item 6: o teto mede o texto cru (como a CHECK do banco), não o
    // aparado — senão o front aceita um valor que o `PATCH` recusa depois.
    if (raw.length > limit) {
      errors.push({ field, message: MAIL_TEMPLATE_VALIDATION_ERROR.TEXT_TOO_LONG })
    }
    if (field === 'subject' && LINE_BREAK.test(raw)) {
      errors.push({ field, message: MAIL_TEMPLATE_VALIDATION_ERROR.SUBJECT_HAS_LINE_BREAK })
    }

    const tokens = tokenizeTemplate(raw)
    if (tokens === undefined) {
      errors.push({ field, message: MAIL_TEMPLATE_VALIDATION_ERROR.UNMATCHED_BRACE })
      return errors
    }

    const variableErrors = new Set<MailTemplateValidationError>()
    for (const token of tokens) {
      if (token.kind === 'text') continue
      if (itemNames.has(token.name)) {
        if (field !== ITEM_FIELD)
          variableErrors.add(MAIL_TEMPLATE_VALIDATION_ERROR.ITEM_VARIABLE_OUTSIDE_ITEM_TEXT)
        continue
      }
      if (!mailNames.has(token.name))
        variableErrors.add(MAIL_TEMPLATE_VALIDATION_ERROR.UNKNOWN_VARIABLE)
    }
    for (const message of variableErrors) errors.push({ field, message })

    return errors
  })
}

/** Igual ao tokenizador do servidor: `undefined` quando há `{`/`}` solto ou variável malformada. */
export function tokenizeTemplate(text: string): readonly TemplateToken[] | undefined {
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
