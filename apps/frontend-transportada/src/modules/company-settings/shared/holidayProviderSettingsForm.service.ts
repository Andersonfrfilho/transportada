/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  HOLIDAY_PROVIDER_BUDGET_MAX,
  HOLIDAY_PROVIDER_BUDGET_MIN,
  HOLIDAY_PROVIDER_BUDGET_ORIGIN,
  HOLIDAY_PROVIDER_FIELD,
  HOLIDAY_PROVIDER_TOKEN_PATTERN,
} from './holidayProviderSettings.constant'
import type {
  HolidayProviderSettings,
  SaveHolidayProviderSettingsInput,
} from './holidayProviderSettings.types'

export type HolidayProviderField =
  (typeof HOLIDAY_PROVIDER_FIELD)[keyof typeof HOLIDAY_PROVIDER_FIELD]

/** O que a pessoa digitou: texto cru nos dois campos. A chave NUNCA vem do servidor, então o rascunho nasce vazio. */
export type HolidayProviderDraft = Readonly<{ budget: string; token: string }>

export type HolidayProviderSubmission =
  | Readonly<{ body: SaveHolidayProviderSettingsInput; status: 'ready' }>
  | Readonly<{ fields: readonly HolidayProviderField[]; status: 'blocked' }>
  | Readonly<{ status: 'unchanged' }>

type DraftInput = Readonly<{ draft: HolidayProviderDraft; settings: HolidayProviderSettings }>

const BUDGET_PATTERN = /^[0-9]{1,7}$/u

export function isInstallationBudget(settings: HolidayProviderSettings): boolean {
  return settings.budgetOrigin === HOLIDAY_PROVIDER_BUDGET_ORIGIN.INSTALLATION
}

/** O orçamento só abre preenchido quando o administrador o definiu; o padrão aparece como dica, nunca como valor. */
export function toInitialHolidayProviderDraft(
  settings: HolidayProviderSettings,
): HolidayProviderDraft {
  return {
    budget: isInstallationBudget(settings) ? String(settings.monthlyRequestBudget) : '',
    token: '',
  }
}

function isBudgetInRange(text: string): boolean {
  if (!BUDGET_PATTERN.test(text)) return false
  const value = Number(text)
  return value >= HOLIDAY_PROVIDER_BUDGET_MIN && value <= HOLIDAY_PROVIDER_BUDGET_MAX
}

function listBlockedFields(draft: HolidayProviderDraft): readonly HolidayProviderField[] {
  const token = draft.token.trim()
  const budget = draft.budget.trim()
  return [
    ...(token !== '' && !HOLIDAY_PROVIDER_TOKEN_PATTERN.test(token)
      ? [HOLIDAY_PROVIDER_FIELD.TOKEN]
      : []),
    ...(budget !== '' && !isBudgetInRange(budget) ? [HOLIDAY_PROVIDER_FIELD.BUDGET] : []),
  ]
}

/**
 * Orçamento: ausente mantém. Vazio volta ao padrão (`null`) só quando havia valor definido: sem linha, `null` sozinho é
 * 400 na API, e com o padrão já valendo não há o que mudar. O mesmo número que já está gravado não é reenviado.
 */
function resolveBudgetChange({ draft, settings }: DraftInput): number | null | undefined {
  const budget = draft.budget.trim()
  const isExplicit = isInstallationBudget(settings)
  if (budget === '') return isExplicit ? null : undefined
  const value = Number(budget)
  return isExplicit && value === settings.monthlyRequestBudget ? undefined : value
}

/**
 * O corpo do `PUT`: a chave só vai quando foi digitada (aparada, na regra da API), a versão lida vai junto quando a
 * linha existe, e o que não mudou fica de fora — a API mantém o que não vem no corpo.
 */
export function buildHolidayProviderSubmission(input: DraftInput): HolidayProviderSubmission {
  const fields = listBlockedFields(input.draft)
  if (fields.length > 0) return { fields, status: 'blocked' }
  const token = input.draft.token.trim()
  const budget = resolveBudgetChange(input)
  if (token === '' && budget === undefined) return { status: 'unchanged' }
  return {
    body: {
      ...(input.settings.version === null ? {} : { expectedVersion: input.settings.version }),
      ...(budget === undefined ? {} : { monthlyRequestBudget: budget }),
      ...(token === '' ? {} : { token }),
    },
    status: 'ready',
  }
}
