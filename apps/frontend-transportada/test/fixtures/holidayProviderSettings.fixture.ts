/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.1: o formato REAL das respostas de `GET|PUT /holiday-imports/provider-settings` e
 * `GET|PUT /company-settings/holiday-import` (apps/api-transportada, `holiday-provider-settings.schema.ts` e
 * `holiday-import-enablement.routes.ts`), com dados fictícios. A chave abaixo é uma sentinela falsa: o contrato a procura
 * no DOM, no corpo das respostas e nas mensagens, e ela nunca deve aparecer.
 */
import type {
  HolidayImportEnablement,
  HolidayProviderSettings,
} from '@/modules/company-settings/shared/holidayProviderSettings.types'

export const FAKE_PROVIDER_TOKEN = 'FAKE-feriados-sentinel-Q7zK-0000'
export const FAKE_PROVIDER_TOKEN_HINT = '1234'
export const SETTINGS_VERSION = '3'

/** Instalação sem linha: sem chave e o orçamento padrão. */
export function buildEmptyProviderSettings(
  overrides: Partial<HolidayProviderSettings> = {},
): HolidayProviderSettings {
  return {
    budgetOrigin: 'default',
    monthlyRequestBudget: 4500,
    tokenConfigured: false,
    tokenHint: null,
    tokenUpdatedAt: null,
    updatedAt: null,
    version: null,
    ...overrides,
  }
}

/** Chave configurada (…1234), orçamento padrão. */
export function buildProviderSettings(
  overrides: Partial<HolidayProviderSettings> = {},
): HolidayProviderSettings {
  return {
    budgetOrigin: 'default',
    monthlyRequestBudget: 4500,
    tokenConfigured: true,
    tokenHint: FAKE_PROVIDER_TOKEN_HINT,
    tokenUpdatedAt: '2026-10-09T15:00:00.000Z',
    updatedAt: '2026-10-09T15:00:00.000Z',
    version: SETTINGS_VERSION,
    ...overrides,
  }
}

export function buildEnablement(
  overrides: Partial<HolidayImportEnablement> = {},
): HolidayImportEnablement {
  return { isEnabled: true, origin: 'default', ...overrides }
}
