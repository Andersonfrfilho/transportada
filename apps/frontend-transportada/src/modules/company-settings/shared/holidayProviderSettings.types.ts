/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  HOLIDAY_ENABLEMENT_ORIGINS,
  HOLIDAY_PROVIDER_BUDGET_ORIGINS,
} from './holidayProviderSettings.constant'

export type HolidayProviderBudgetOrigin = (typeof HOLIDAY_PROVIDER_BUDGET_ORIGINS)[number]
export type HolidayEnablementOrigin = (typeof HOLIDAY_ENABLEMENT_ORIGINS)[number]

/**
 * A configuração da instalação como a API a devolve (RF3): a chave e o envelope nunca vêm — só se há uma e os quatro
 * últimos caracteres. `monthlyRequestBudget` é o valor EFETIVO e `budgetOrigin` diz de onde veio.
 */
export type HolidayProviderSettings = Readonly<{
  budgetOrigin: HolidayProviderBudgetOrigin
  monthlyRequestBudget: number
  tokenConfigured: boolean
  tokenHint: string | null
  tokenUpdatedAt: string | null
  updatedAt: string | null
  /** `null` enquanto a instalação não tem linha; é o `expectedVersion` do próximo `PUT`. */
  version: string | null
}>

/** O corpo do `PUT`: ausente mantém, `null` no orçamento volta ao padrão, a chave só vai quando foi digitada. */
export type SaveHolidayProviderSettingsInput = Readonly<{
  expectedVersion?: string
  monthlyRequestBudget?: number | null
  token?: string
}>

export type HolidayImportEnablement = Readonly<{
  isEnabled: boolean
  origin: HolidayEnablementOrigin
}>
