/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Mapa código→chave de locale (evidence.md T402 § "Contrato HTTP"). */
const CONTRACTOR_MAIL_TEMPLATE_ERROR_LOCALE_KEY: Readonly<Record<string, string>> = {
  CONTRACTOR_MAIL_TEMPLATE_ARCHIVED: 'mailTemplates.errorArchived',
  CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN: 'mailTemplates.errorNameTaken',
  CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND: 'mailTemplates.errorNotFound',
  CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT: 'mailTemplates.errorVersionConflict',
  INVALID_REQUEST: 'mailTemplates.errorInvalidRequest',
} as const

const DEFAULT_LOCALE_KEY = 'mailTemplates.errorGeneric'

/** `undefined` de código nunca chega aqui: o chamador só invoca com um erro presente. */
export function contractorMailTemplateErrorLocaleKey(code: string): string {
  return CONTRACTOR_MAIL_TEMPLATE_ERROR_LOCALE_KEY[code] ?? DEFAULT_LOCALE_KEY
}

/** Recarregar em vez de sobrescrever: outra aba mudou o modelo entre a leitura e o envio. */
export function isMailTemplateVersionConflict(code: string): boolean {
  return code === 'CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT'
}
