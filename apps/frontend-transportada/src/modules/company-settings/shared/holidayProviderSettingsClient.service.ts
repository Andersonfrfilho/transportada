/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BUSINESS_CALENDAR_ERROR } from './businessCalendar.constant'
import { isDataEnvelope } from './businessCalendarGuards.validation'
import {
  BusinessCalendarRequestError,
  requestBusinessCalendar,
  type BusinessCalendarDependencies,
} from './businessCalendarRequest.service'
import { HOLIDAY_PROVIDER_SETTINGS_PATH } from './holidayProviderSettings.constant'
import type {
  HolidayImportEnablement,
  HolidayProviderSettings,
  SaveHolidayProviderSettingsInput,
} from './holidayProviderSettings.types'
import {
  isHolidayImportEnablement,
  isHolidayProviderSettings,
} from './holidayProviderSettingsGuards.validation'

export type HolidayProviderSettingsClient = Readonly<{
  getEnablement: () => Promise<HolidayImportEnablement>
  getSettings: () => Promise<HolidayProviderSettings>
  /** Zera só a chave: o orçamento fica. Repetir é 204 (a API é idempotente). */
  removeToken: () => Promise<void>
  /** Desligar não apaga o que já foi importado. */
  saveEnablement: (isEnabled: boolean) => Promise<HolidayImportEnablement>
  /** Só o que veio no corpo muda: chave omitida mantém a gravada e `null` no orçamento volta ao padrão. */
  saveSettings: (input: SaveHolidayProviderSettingsInput) => Promise<HolidayProviderSettings>
}>

function invalidResponse(): BusinessCalendarRequestError {
  return new BusinessCalendarRequestError({
    code: BUSINESS_CALENDAR_ERROR.RESPONSE_INVALID,
    status: 0,
  })
}

function readSettings(body: unknown): HolidayProviderSettings {
  if (!isDataEnvelope(body) || !isHolidayProviderSettings(body.data)) throw invalidResponse()
  return body.data
}

function readEnablement(body: unknown): HolidayImportEnablement {
  if (!isDataEnvelope(body) || !isHolidayImportEnablement(body.data)) throw invalidResponse()
  return body.data
}

export function createHolidayProviderSettingsClient(
  dependencies: BusinessCalendarDependencies,
): HolidayProviderSettingsClient {
  return {
    getEnablement: async () => {
      const { body } = await requestBusinessCalendar({
        dependencies,
        method: 'GET',
        path: HOLIDAY_PROVIDER_SETTINGS_PATH.ENABLEMENT,
      })
      return readEnablement(body)
    },
    getSettings: async () => {
      const { body } = await requestBusinessCalendar({
        dependencies,
        method: 'GET',
        path: HOLIDAY_PROVIDER_SETTINGS_PATH.SETTINGS,
      })
      return readSettings(body)
    },
    removeToken: async () => {
      await requestBusinessCalendar({
        dependencies,
        method: 'DELETE',
        path: HOLIDAY_PROVIDER_SETTINGS_PATH.TOKEN,
      })
    },
    saveEnablement: async (isEnabled) => {
      const { body } = await requestBusinessCalendar({
        body: { isEnabled },
        dependencies,
        method: 'PUT',
        path: HOLIDAY_PROVIDER_SETTINGS_PATH.ENABLEMENT,
      })
      return readEnablement(body)
    },
    saveSettings: async (input) => {
      const { body } = await requestBusinessCalendar({
        body: input,
        dependencies,
        method: 'PUT',
        path: HOLIDAY_PROVIDER_SETTINGS_PATH.SETTINGS,
      })
      return readSettings(body)
    },
  }
}
