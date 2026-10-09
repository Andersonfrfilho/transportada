/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { SaveHolidayProviderSettingsInput } from '../application/holiday-provider-settings.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_TARGET,
  HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
} from '../domain/business-calendar-audit.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

export const CHANGED_FIELD = { BUDGET: 'monthlyRequestBudget', TOKEN: 'token' } as const

/** O que a trilha enxerga da linha: o envelope só entra como "existe ou não", nunca o conteúdo. */
type AuditedRow = {
  readonly id: string
  readonly monthlyRequestBudget: number
  readonly tokenEnvelope: unknown
  readonly version: bigint
}

/** Em ordem alfabética: é o que a trilha grava em `metadata.changedFields`. */
export function listChangedFields(params: {
  readonly input: SaveHolidayProviderSettingsInput
  readonly previous: AuditedRow | undefined
}): readonly string[] {
  const { input, previous } = params
  const budgetChanged =
    input.monthlyRequestBudget !== undefined &&
    input.monthlyRequestBudget !== previous?.monthlyRequestBudget
  return [
    ...(budgetChanged ? [CHANGED_FIELD.BUDGET] : []),
    ...(input.sealedToken === undefined ? [] : [CHANGED_FIELD.TOKEN]),
  ]
}

/** Nunca a chave, a dica nem o envelope: só se há chave, o orçamento e a versão. */
function toSnapshot(row: AuditedRow): Record<string, unknown> {
  return {
    monthlyRequestBudget: row.monthlyRequestBudget,
    tokenConfigured: row.tokenEnvelope !== null,
    version: row.version.toString(),
  }
}

/** A trilha cai na empresa do ator e registra a permissão dedicada que a rota exigiu. */
export async function auditHolidayProviderSettings(params: {
  readonly action: string
  readonly actor: BusinessCalendarActor
  readonly after: AuditedRow
  readonly before: AuditedRow | null
  readonly changedFields: readonly string[]
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  await appendBusinessCalendarAudit({
    action: params.action,
    actor: params.actor,
    after: toSnapshot(params.after),
    before: params.before === null ? null : toSnapshot(params.before),
    entityId: params.after.id,
    metadata: { changedFields: params.changedFields },
    permission: HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
    target: BUSINESS_CALENDAR_AUDIT_TARGET.HOLIDAY_PROVIDER_SETTINGS,
    transaction: params.transaction,
  })
}
