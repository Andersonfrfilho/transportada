/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  CONTRACTOR_MAIL_TEMPLATE_KEYS,
  CONTRACTOR_MAIL_TEMPLATE_STATUSES,
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  MAIL_TEMPLATE_CATALOG_ENTRY_KEYS,
  MAIL_TEMPLATE_PREVIEW_RESULT_KEYS,
  MAIL_TEMPLATE_SUGGESTED_TEMPLATE_KEYS,
  MAIL_TEMPLATE_VARIABLE_KEYS,
  type ContractorMailTemplate,
  type MailTemplateCatalogEntry,
  type MailTemplatePreviewResult,
  type MailTemplateVariable,
} from './contractorMailTemplates.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3). Mesma disciplina de
 * `contractorMailSettingsResponse.validation.ts`: recusa a resposta inteira, com erro explícito,
 * em vez de deixar um campo a mais ou a menos atravessar até a tela.
 */
export class ContractorMailTemplatesResponseError extends Error {
  public constructor() {
    super('CONTRACTOR_MAIL_TEMPLATES_RESPONSE_INVALID')
    this.name = 'ContractorMailTemplatesResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

function isVariable(value: unknown): value is MailTemplateVariable {
  return (
    hasExactKeys(value, MAIL_TEMPLATE_VARIABLE_KEYS) &&
    isString(value.description) &&
    isString(value.name)
  )
}

function isCatalogEntry(value: unknown): value is MailTemplateCatalogEntry {
  if (!hasExactKeys(value, MAIL_TEMPLATE_CATALOG_ENTRY_KEYS)) return false
  if (!Array.isArray(value.itemVariables) || !value.itemVariables.every(isVariable)) return false
  if (!Array.isArray(value.mailVariables) || !value.mailVariables.every(isVariable)) return false
  if (!isString(value.label) || !isOneOf(value.mailType, CONTRACTOR_MAIL_TEMPLATE_TYPES))
    return false
  const { suggestedTemplate } = value
  if (!hasExactKeys(suggestedTemplate, MAIL_TEMPLATE_SUGGESTED_TEMPLATE_KEYS)) return false
  return (
    isString(suggestedTemplate.closing) &&
    isString(suggestedTemplate.intro) &&
    isString(suggestedTemplate.itemText) &&
    isString(suggestedTemplate.name) &&
    isString(suggestedTemplate.subject)
  )
}

function isTemplate(value: unknown): value is ContractorMailTemplate {
  if (!hasExactKeys(value, CONTRACTOR_MAIL_TEMPLATE_KEYS)) return false
  return (
    isString(value.closing) &&
    isString(value.id) &&
    isString(value.intro) &&
    typeof value.isDefault === 'boolean' &&
    isString(value.itemText) &&
    isOneOf(value.mailType, CONTRACTOR_MAIL_TEMPLATE_TYPES) &&
    isString(value.name) &&
    isOneOf(value.status, CONTRACTOR_MAIL_TEMPLATE_STATUSES) &&
    isString(value.subject) &&
    isString(value.updatedAt) &&
    isString(value.version)
  )
}

export function catalogFromApi(payload: unknown): readonly MailTemplateCatalogEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !payload.data.every(isCatalogEntry)) {
    throw new ContractorMailTemplatesResponseError()
  }
  return payload.data
}

export function templateFromApi(payload: unknown): ContractorMailTemplate {
  if (!isRecord(payload) || !isTemplate(payload.data)) {
    throw new ContractorMailTemplatesResponseError()
  }
  return payload.data
}

export function templateListFromApi(payload: unknown): readonly ContractorMailTemplate[] {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !payload.data.every(isTemplate)) {
    throw new ContractorMailTemplatesResponseError()
  }
  return payload.data
}

export function previewFromApi(payload: unknown): MailTemplatePreviewResult {
  if (!isRecord(payload) || !hasExactKeys(payload.data, MAIL_TEMPLATE_PREVIEW_RESULT_KEYS)) {
    throw new ContractorMailTemplatesResponseError()
  }
  const { data } = payload
  if (!isString(data.html) || !isString(data.subject) || !isString(data.text)) {
    throw new ContractorMailTemplatesResponseError()
  }
  return { html: data.html, subject: data.subject, text: data.text }
}
