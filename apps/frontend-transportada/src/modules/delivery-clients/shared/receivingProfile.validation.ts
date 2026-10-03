/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormIssue, FormIssues } from './contractorFormIssue.types'
import type { ReceivingProfileDraft } from './receivingProfileDraft.service'
import {
  PREVIEW_ITEM_FIELDS,
  PREVIEW_REQUIRED_FIELDS,
  RECEIVING_PROFILE_LIMITS as LIMITS,
} from './receivingProfile.types'

type Range = Readonly<{ max: number; min: number }>

const INTEGER_PATTERN = /^\d+$/u
const DECIMAL_PATTERN = /^\d+(?:[.,]\d+)?$/u
const MAX_DECIMAL_PLACES = 2

function validateInteger(
  input: Readonly<{ isRequired: boolean; range: Range; value: string }>,
): FormIssue | undefined {
  const text = input.value.trim()
  if (text === '') return input.isRequired ? { code: 'required' } : undefined
  if (!INTEGER_PATTERN.test(text)) return { code: 'notAnInteger' }
  const number = Number(text)
  if (number < input.range.min || number > input.range.max) {
    return { code: 'outOfRange', max: input.range.max, min: input.range.min }
  }
  return undefined
}

function validateTolerance(value: string): FormIssue | undefined {
  const text = value.trim()
  if (text === '') return { code: 'required' }
  if (!DECIMAL_PATTERN.test(text)) return { code: 'notANumber' }
  const decimals = text.split(/[.,]/u)[1] ?? ''
  if (decimals.length > MAX_DECIMAL_PLACES) return { code: 'tooManyDecimals' }
  const number = Number(text.replace(',', '.'))
  const { max, min } = LIMITS.weightTolerancePercent
  return number < min || number > max ? { code: 'outOfRange', max, min } : undefined
}

function validateLength(input: Readonly<{ max: number; value: string }>): FormIssue | undefined {
  return input.value.trim().length > input.max ? { code: 'tooLong', max: input.max } : undefined
}

function normalizeColumnName(columnName: string): string {
  return columnName.trim().normalize('NFC').toUpperCase()
}

function validateColumnMap(draft: ReceivingProfileDraft): FormIssues {
  const issues: Record<string, FormIssue> = {}
  const seen = new Set<string>()
  for (const field of PREVIEW_ITEM_FIELDS) {
    const columnName = draft.previewColumnMap[field]
    const tooLong = validateLength({ max: LIMITS.previewColumnNameMaxLength, value: columnName })
    if (tooLong !== undefined) issues[`previewColumnMap.${field}`] = tooLong
    if (columnName.trim() === '') continue
    const normalized = normalizeColumnName(columnName)
    if (seen.has(normalized)) issues[`previewColumnMap.${field}`] = { code: 'duplicateColumn' }
    seen.add(normalized)
  }
  if (!draft.previewEnabled) return issues
  for (const field of PREVIEW_REQUIRED_FIELDS) {
    if (draft.previewColumnMap[field].trim() === '') {
      issues[`previewColumnMap.${field}`] = { code: 'requiredForPreview' }
    }
  }
  return issues
}

/** As mesmas faixas que o servidor aplica: o erro aparece no campo, antes de ir à rede. */
export function validateReceivingProfileDraft(draft: ReceivingProfileDraft): FormIssues {
  const issues: Record<string, FormIssue | undefined> = {
    arrivalReferencePattern: validateLength({
      max: LIMITS.arrivalReferencePatternMaxLength,
      value: draft.arrivalReferencePattern,
    }),
    deliveryDeadlineBusinessDays: validateInteger({
      isRequired: false,
      range: LIMITS.deliveryDeadlineBusinessDays,
      value: draft.deliveryDeadlineBusinessDays,
    }),
    matchWindowDays: validateInteger({
      isRequired: true,
      range: LIMITS.matchWindowDays,
      value: draft.matchWindowDays,
    }),
    previewSheetName: validateLength({
      max: LIMITS.previewSheetNameMaxLength,
      value: draft.previewSheetName,
    }),
    separationWindowHours: validateInteger({
      isRequired: false,
      range: LIMITS.separationWindowHours,
      value: draft.separationWindowHours,
    }),
    weightTolerancePercent: validateTolerance(draft.weightTolerancePercent),
  }
  const found = Object.entries(issues).flatMap(([field, issue]) =>
    issue === undefined ? [] : [[field, issue] as const],
  )
  return { ...Object.fromEntries(found), ...validateColumnMap(draft) }
}
