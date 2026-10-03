/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ContractorDirectoryRequestError } from './contractorDirectoryRequest.service'

/** `labelKey` é a chave do rótulo impresso (namespace `contractorDirectory`); sem ela, a tela usa o nome cru. */
export type RefusedField = Readonly<{ field: string; labelKey: string | undefined }>

const PREVIEW_COLUMN_PREFIX = 'previewColumnMap.'

/**
 * `web.md` §11.4: o rótulo impresso é o que aparece, nunca o caminho do corpo. O mapa mora aqui, num
 * arquivo só, e **campo sem rótulo conhecido não some do aviso**: sai com o nome que a API usou —
 * esconder o desconhecido devolveria o aviso genérico que esta regra conserta.
 */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  arrivalReferencePattern: 'fields.arrivalReferencePattern',
  closingPeriod: 'details.closingPeriod',
  deliveryDeadlineBusinessDays: 'fields.deliveryDeadlineBusinessDays',
  displayName: 'details.displayName',
  isEnabled: 'fields.isEnabled',
  matchWindowDays: 'fields.matchWindowDays',
  notes: 'details.notes',
  previewColumnMap: 'fields.previewColumnMap',
  previewEnabled: 'fields.previewEnabled',
  previewSheetName: 'fields.previewSheetName',
  reportEmail: 'details.reportEmail',
  requiresDamageCheck: 'fields.requiresDamageCheck',
  separationWindowHours: 'fields.separationWindowHours',
  status: 'details.status',
  weightTolerancePercent: 'fields.weightTolerancePercent',
}

function resolveLabelKey(field: string): string | undefined {
  if (field.startsWith(PREVIEW_COLUMN_PREFIX)) {
    return `columns.${field.slice(PREVIEW_COLUMN_PREFIX.length)}`
  }
  return FIELD_LABEL_KEYS[field]
}

/** Deduplicado por campo: quem viola duas regras é um item, não dois. */
export function describeFieldPaths(fields: readonly string[]): readonly RefusedField[] {
  return [...new Set(fields)].map((field) => ({ field, labelKey: resolveLabelKey(field) }))
}

export function describeRefusedFields(error: unknown): readonly RefusedField[] {
  if (!(error instanceof ContractorDirectoryRequestError)) return []
  return describeFieldPaths(error.details.map((detail) => detail.field))
}
