/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

/**
 * O que a API sabe da chave: se existe, a dica e quando foi trocada. O envelope e quem alterou ficam no
 * repositório, que é o único que lê a linha crua.
 */
export type HolidayProviderSettingsRecord = {
  readonly id: string
  readonly monthlyRequestBudget: number
  readonly tokenConfigured: boolean
  readonly tokenHint: string | null
  readonly tokenUpdatedAt: Date | null
  readonly updatedAt: Date
  readonly version: bigint
}

export type SealedHolidayProviderToken = {
  readonly envelope: SecretEnvelopeV1
  readonly hint: string
}

export type SaveHolidayProviderSettingsInput = BusinessCalendarActor & {
  /** Ausente é a intenção de criar (`INSERT … ON CONFLICT DO NOTHING`); presente é `UPDATE … WHERE version`. */
  readonly expectedVersion: bigint | undefined
  readonly monthlyRequestBudget: number | undefined
  /** Só a chave nova, já selada para `settingsId`: o texto em claro nunca chega à porta. */
  readonly sealedToken: SealedHolidayProviderToken | undefined
  /**
   * Gerado pelo caso de uso **antes** de selar: o AAD do envelope precisa do id antes de a linha existir
   * (molde `contractor-mail.port.ts`), então quem decide o id de uma linha nova é quem sela a chave.
   */
  readonly settingsId: string
}

/** Sem linha é resposta válida: sem chave e com o orçamento padrão. Perder a corrida é `409`. */
export type HolidayProviderSettingsPort = {
  find(): Promise<HolidayProviderSettingsRecord | null>
  /** Sem chave configurada é no-op (`204` idempotente), sem auditoria. */
  removeToken(input: BusinessCalendarActor): Promise<void>
  save(input: SaveHolidayProviderSettingsInput): Promise<HolidayProviderSettingsRecord>
}
