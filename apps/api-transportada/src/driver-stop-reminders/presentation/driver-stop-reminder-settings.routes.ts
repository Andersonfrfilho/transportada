/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T4.2 (RF19): a configuração da cobrança do motorista, por empresa. Sem linha é resposta válida
 * (desligada, padrões, origem `default`), não 404; `settings.manage` para ler e escrever.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_DRIVER_STOP_REMINDER_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  DriverStopReminderSettingsPort,
  DriverStopReminderStoredSettings,
} from '../application/driver-stop-reminder-settings.port.js'
import {
  DRIVER_STOP_REMINDER_SETTINGS_AUDIT,
  DRIVER_STOP_REMINDER_SETTINGS_ORIGIN,
} from '../domain/driver-stop-reminder.constant.js'
import type { StopReminderCompanySettings } from '../domain/driver-stop-reminder.types.js'
import { driverStopReminderSettingsSchema } from './driver-stop-reminder-settings.schema.js'

const SETTINGS_POLICY = {
  permission: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.PERMISSION,
  scope: 'company',
} as const

type SaveInput = StopReminderCompanySettings & {
  readonly correlationId: string
  readonly ipAddress: string
}

export function createDriverStopReminderSettingsRoutes(dependencies: {
  readonly resolveClientIp: ClientIpResolver
  readonly settings: DriverStopReminderSettingsPort
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      handle: async ({ context }) =>
        settingsResponse(await dependencies.settings.find({ companyId: context.scope.companyId })),
      method: 'GET',
      parse: () => undefined,
      pathname: API_DRIVER_STOP_REMINDER_SETTINGS_PATH,
      policy: SETTINGS_POLICY,
    }),
    defineRoute<SaveInput>({
      handle: async ({ context, input }) =>
        settingsResponse(
          await dependencies.settings.save({
            ...input,
            companyId: context.scope.companyId,
            userId: context.scope.userId,
          }),
        ),
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseBody(driverStopReminderSettingsSchema, request)),
      }),
      pathname: API_DRIVER_STOP_REMINDER_SETTINGS_PATH,
      policy: SETTINGS_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function settingsResponse(stored: DriverStopReminderStoredSettings): Response {
  const { settings, updatedAt } = stored
  return new Response(
    JSON.stringify({
      data: {
        dwellMinutes: settings.dwellMinutes,
        enabled: settings.enabled,
        graceMinMinutes: settings.graceMinMinutes,
        gracePercent: settings.gracePercent,
        idleMinutes: settings.idleMinutes,
        intervalMinutes: settings.intervalMinutes,
        maxAttempts: settings.maxAttempts,
        operatingHours: settings.operatingHours.map((range) => ({
          end: range.end,
          start: range.start,
          weekday: range.weekday,
        })),
        origin:
          updatedAt === null
            ? DRIVER_STOP_REMINDER_SETTINGS_ORIGIN.DEFAULT
            : DRIVER_STOP_REMINDER_SETTINGS_ORIGIN.COMPANY,
        updatedAt: updatedAt?.toISOString() ?? null,
      },
    }),
    { headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }, status: 200 },
  )
}
