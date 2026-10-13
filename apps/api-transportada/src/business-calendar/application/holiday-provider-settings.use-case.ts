/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HOLIDAY_PROVIDER_TOKEN_HINT_LENGTH } from '../domain/holiday-provider-settings.constant.js'
import { HolidayProviderSettingsVersionConflictError } from '../domain/holiday-provider-settings.error.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import type {
  HolidayProviderSettingsPort,
  HolidayProviderSettingsRecord,
  SealedHolidayProviderToken,
} from './holiday-provider-settings.port.js'
import type { HolidayProviderTokenSecretService } from './holiday-provider-token-secret.service.js'

/** O corpo do `PUT` depois do Zod: a chave em claro só existe até aqui. */
export type SaveHolidayProviderSettingsCommand = BusinessCalendarActor & {
  readonly expectedVersion: bigint | undefined
  readonly monthlyRequestBudget: number | null | undefined
  readonly token: string | undefined
}

export type HolidayProviderSettingsUseCases = {
  readonly get: {
    readonly execute: () => Promise<HolidayProviderSettingsRecord | null>
  }
  readonly removeToken: {
    readonly execute: (input: BusinessCalendarActor) => Promise<void>
  }
  readonly save: {
    readonly execute: (
      input: SaveHolidayProviderSettingsCommand,
    ) => Promise<HolidayProviderSettingsRecord>
  }
}

type Dependencies = {
  readonly port: HolidayProviderSettingsPort
  readonly secrets: HolidayProviderTokenSecretService
}

/**
 * Spec 262 RF4. `expectedVersion` decide a intenção, não a leitura de `find()` (que é só um palpite: entre ela e
 * a escrita outra requisição pode ter vencido). Quem decide de verdade é a porta, com uma consulta atômica; aqui
 * só se escolhe o id: novo para criar, o da linha para atualizar — e a chave é selada para ESSE id, antes de a
 * porta ser chamada.
 */
export function createHolidayProviderSettingsUseCases(
  dependencies: Dependencies,
): HolidayProviderSettingsUseCases {
  return {
    get: { execute: () => dependencies.port.find() },
    removeToken: { execute: (input) => dependencies.port.removeToken(input) },
    save: { execute: (input) => saveSettings({ dependencies, input }) },
  }
}

async function saveSettings(params: {
  readonly dependencies: Dependencies
  readonly input: SaveHolidayProviderSettingsCommand
}): Promise<HolidayProviderSettingsRecord> {
  const { dependencies, input } = params
  const { token, ...rest } = input
  const settingsId = await resolveSettingsId({ dependencies, input })
  const sealedToken =
    token === undefined ? undefined : await sealToken({ dependencies, settingsId, token })

  return dependencies.port.save({ ...rest, sealedToken, settingsId })
}

async function resolveSettingsId(params: {
  readonly dependencies: Dependencies
  readonly input: SaveHolidayProviderSettingsCommand
}): Promise<string> {
  if (params.input.expectedVersion === undefined) return crypto.randomUUID()
  const existing = await params.dependencies.port.find()
  // Atualizar o que não existe é perder a corrida: nada é selado nem gravado.
  if (existing === null) throw new HolidayProviderSettingsVersionConflictError()
  return existing.id
}

async function sealToken(params: {
  readonly dependencies: Dependencies
  readonly settingsId: string
  readonly token: string
}): Promise<SealedHolidayProviderToken> {
  const envelope = await params.dependencies.secrets.encrypt({
    settingsId: params.settingsId,
    token: params.token,
  })
  return { envelope, hint: params.token.slice(-HOLIDAY_PROVIDER_TOKEN_HINT_LENGTH) }
}
