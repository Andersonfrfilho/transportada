/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 (ADR-0102 D3): lê a linha única da configuração da instalação (uma consulta por ciclo) e abre a
 * chave com o chaveiro do worker. Sem chave guardada → `token_missing`; chave que não abre, por qualquer
 * motivo → `token_unreadable`, sem mensagem. Erro de banco **não** é capturado aqui: propaga e falha a etapa.
 * O orçamento é `coalesce(monthly_request_budget, padrão)`: a coluna NULL é o padrão (decisão M1).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { holidayProviderSettings } from '../../database/holiday-provider-settings.schema.js'
import type {
  HolidayProviderAccess,
  HolidayProviderAccessReader,
} from '../application/holiday-provider-access.port.js'
import type { HolidayProviderTokenSecretService } from '../application/holiday-provider-token-secret.service.js'
import {
  FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
  FERIADOS_API_SETTINGS_PROVIDER,
} from '../domain/holiday-provider-pull.constant.js'
import { HolidayProviderTokenUnreadableError } from '../domain/holiday-provider-token.error.js'

type HolidayProviderSettingsDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleHolidayProviderSettingsReader(input: {
  readonly database: HolidayProviderSettingsDatabase
  readonly tokenSecret: HolidayProviderTokenSecretService
}): HolidayProviderAccessReader {
  return {
    readAccess: async () => {
      const [row] = await input.database
        .select({
          budget: holidayProviderSettings.monthlyRequestBudget,
          id: holidayProviderSettings.id,
          tokenEnvelope: holidayProviderSettings.tokenEnvelope,
        })
        .from(holidayProviderSettings)
        .where(eq(holidayProviderSettings.provider, FERIADOS_API_SETTINGS_PROVIDER))
        .limit(1)

      const budget = row?.budget ?? FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET
      if (row === undefined || row.tokenEnvelope === null) return { budget, kind: 'token_missing' }

      return openToken({
        budget,
        envelope: row.tokenEnvelope,
        settingsId: row.id,
        tokenSecret: input.tokenSecret,
      })
    },
  }
}

async function openToken(input: {
  readonly budget: number
  readonly envelope: unknown
  readonly settingsId: string
  readonly tokenSecret: HolidayProviderTokenSecretService
}): Promise<HolidayProviderAccess> {
  try {
    const token = await input.tokenSecret.decrypt({
      envelope: input.envelope,
      settingsId: input.settingsId,
    })
    return { budget: input.budget, kind: 'ready', token }
  } catch (error: unknown) {
    if (error instanceof HolidayProviderTokenUnreadableError) return { kind: 'token_unreadable' }
    throw error
  }
}
