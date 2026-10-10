/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2: a API da chave da FeriadosAPI dublada com as MESMAS transições da T3.3/T3.4 — `expectedVersion`
 * obrigatório quando a linha existe e ausente quando não existe (409 nos dois desencontros), a dica são os 4 últimos
 * caracteres, o orçamento `null` volta ao padrão, `DELETE` zera só a chave e sobe a versão. Quem monta o cliente passa o
 * `record` do dublê do calendário (`businessCalendarClientMocks.helper.ts`), para as chamadas caírem no mesmo registro.
 * O dublê NUNCA guarda a chave inteira: só a dica, como a API.
 */
import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'
import type { HolidayProviderSettingsClient } from '@/modules/company-settings/shared/holidayProviderSettingsClient.service'
import type {
  HolidayImportEnablement,
  HolidayProviderSettings,
} from '@/modules/company-settings/shared/holidayProviderSettings.types'

import {
  buildEmptyProviderSettings,
  buildEnablement,
} from '../fixtures/holidayProviderSettings.fixture'

export type RecordRequest = <TResult>(
  request: Readonly<{ body?: unknown; key: string; run: () => TResult }>,
) => Promise<TResult>

const DEFAULT_BUDGET = 4500
const HINT_LENGTH = 4
const SAVED_AT = '2026-10-10T12:00:00.000Z'

export const providerSettingsDouble: {
  enablement: HolidayImportEnablement
  settings: HolidayProviderSettings
} = { enablement: buildEnablement(), settings: buildEmptyProviderSettings() }

export function resetProviderSettingsDouble(): void {
  providerSettingsDouble.enablement = buildEnablement()
  providerSettingsDouble.settings = buildEmptyProviderSettings()
}

function refuse(code: string, status: number): never {
  throw new BusinessCalendarRequestError({ code, status })
}

type SaveInput = Parameters<HolidayProviderSettingsClient['saveSettings']>[0]

function nextVersion(current: HolidayProviderSettings): string {
  return String(Number(current.version ?? '0') + 1)
}

function assertVersion(input: SaveInput, current: HolidayProviderSettings): void {
  if (input.expectedVersion !== (current.version ?? undefined)) {
    refuse('HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT', 409)
  }
}

function applyBudget(input: SaveInput, current: HolidayProviderSettings): HolidayProviderSettings {
  if (input.monthlyRequestBudget === undefined) return current
  if (input.monthlyRequestBudget === null) {
    return { ...current, budgetOrigin: 'default', monthlyRequestBudget: DEFAULT_BUDGET }
  }
  return {
    ...current,
    budgetOrigin: 'installation',
    monthlyRequestBudget: input.monthlyRequestBudget,
  }
}

function applyToken(input: SaveInput, current: HolidayProviderSettings): HolidayProviderSettings {
  if (input.token === undefined) return current
  return {
    ...current,
    tokenConfigured: true,
    tokenHint: input.token.slice(-HINT_LENGTH),
    tokenUpdatedAt: SAVED_AT,
  }
}

function save(input: SaveInput): HolidayProviderSettings {
  const current = providerSettingsDouble.settings
  assertVersion(input, current)
  if (input.token === undefined && input.monthlyRequestBudget === undefined) {
    refuse('INVALID_REQUEST', 400)
  }
  const changed = applyBudget(input, applyToken(input, current))
  providerSettingsDouble.settings = {
    ...changed,
    updatedAt: SAVED_AT,
    version: nextVersion(current),
  }
  return providerSettingsDouble.settings
}

function removeToken(): void {
  const current = providerSettingsDouble.settings
  if (!current.tokenConfigured) return
  providerSettingsDouble.settings = {
    ...current,
    tokenConfigured: false,
    tokenHint: null,
    tokenUpdatedAt: null,
    updatedAt: SAVED_AT,
    version: nextVersion(current),
  }
}

export function createProviderSettingsClient(record: RecordRequest): HolidayProviderSettingsClient {
  return {
    getEnablement: () =>
      record({
        key: 'GET /company-settings/holiday-import',
        run: () => providerSettingsDouble.enablement,
      }),
    getSettings: () =>
      record({
        key: 'GET /holiday-imports/provider-settings',
        run: () => providerSettingsDouble.settings,
      }),
    removeToken: () =>
      record({ key: 'DELETE /holiday-imports/provider-settings/token', run: removeToken }),
    saveEnablement: (isEnabled) =>
      record({
        body: { isEnabled },
        key: 'PUT /company-settings/holiday-import',
        run: () => {
          providerSettingsDouble.enablement = { isEnabled, origin: 'company' }
          return providerSettingsDouble.enablement
        },
      }),
    saveSettings: (input) =>
      record({
        body: input,
        key: 'PUT /holiday-imports/provider-settings',
        run: () => save(input),
      }),
  }
}
