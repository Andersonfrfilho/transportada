/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 150 T403: modelos de e-mail por tipo. ⚠️ Cópia por valor do que a API devolve (T402,
 * `mail-template-catalog.constant.ts`) — o bundle não carrega código de lá.
 */
export const CONTRACTOR_MAIL_TEMPLATE_TYPES = ['address_correction'] as const
export type ContractorMailTemplateType = (typeof CONTRACTOR_MAIL_TEMPLATE_TYPES)[number]

/** RF15: arquivado, nunca apagado — a mensagem enviada aponta para o modelo que usou. */
export const CONTRACTOR_MAIL_TEMPLATE_STATUSES = ['active', 'archived'] as const
export type ContractorMailTemplateStatus = (typeof CONTRACTOR_MAIL_TEMPLATE_STATUSES)[number]

/** Tetos do servidor (schema HTTP + CHECK do banco) — a validação do cliente os espelha. */
export const CONTRACTOR_MAIL_TEMPLATE_LIMITS = {
  name: 120,
  subject: 200,
  text: 4000,
} as const

export const MAIL_TEMPLATE_FIELD_NAMES = ['subject', 'intro', 'itemText', 'closing'] as const
export type MailTemplateFieldName = (typeof MAIL_TEMPLATE_FIELD_NAMES)[number]

export type MailTemplateContent = Readonly<{
  closing: string
  intro: string
  itemText: string
  subject: string
}>

export type MailTemplateVariable = Readonly<{ description: string; name: string }>

export const MAIL_TEMPLATE_VARIABLE_KEYS = ['description', 'name'] as const
export const MAIL_TEMPLATE_SUGGESTED_TEMPLATE_KEYS = [
  'closing',
  'intro',
  'itemText',
  'name',
  'subject',
] as const

export type MailTemplateCatalogEntry = Readonly<{
  /** Só no "Texto de cada endereço" — o único campo que se repete por item enviado. */
  itemVariables: readonly MailTemplateVariable[]
  label: string
  mailType: ContractorMailTemplateType
  /** Em assunto, abertura e assinatura (e também aceitas dentro do texto de cada item). */
  mailVariables: readonly MailTemplateVariable[]
  suggestedTemplate: MailTemplateContent & Readonly<{ name: string }>
}>

export const MAIL_TEMPLATE_CATALOG_ENTRY_KEYS = [
  'itemVariables',
  'label',
  'mailType',
  'mailVariables',
  'suggestedTemplate',
] as const

export const CONTRACTOR_MAIL_TEMPLATE_KEYS = [
  'closing',
  'id',
  'intro',
  'isDefault',
  'itemText',
  'mailType',
  'name',
  'status',
  'subject',
  'updatedAt',
  'version',
] as const

export type ContractorMailTemplate = Readonly<{
  closing: string
  id: string
  intro: string
  isDefault: boolean
  itemText: string
  mailType: ContractorMailTemplateType
  name: string
  status: ContractorMailTemplateStatus
  subject: string
  updatedAt: string
  version: string
}>

export const MAIL_TEMPLATE_PREVIEW_RESULT_KEYS = ['html', 'subject', 'text'] as const

export type MailTemplatePreviewResult = Readonly<{ html: string; subject: string; text: string }>
