/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { holidayProviderSettings } from '../../database/holiday-provider-settings.schema.js'
import {
  FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
  HOLIDAY_PROVIDER_SETTINGS_PROVIDERS,
} from '../../shared/holiday-provider.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  HolidayProviderSettingsPort,
  HolidayProviderSettingsRecord,
  SaveHolidayProviderSettingsInput,
  SealedHolidayProviderToken,
} from '../application/holiday-provider-settings.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
  HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
} from '../domain/business-calendar-audit.constant.js'
import { HolidayProviderSettingsVersionConflictError } from '../domain/holiday-provider-settings.error.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type {
  BusinessCalendarDatabase,
  BusinessCalendarTransaction,
} from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'

type SettingsRow = typeof holidayProviderSettings.$inferSelect

const PROVIDER = HOLIDAY_PROVIDER_SETTINGS_PROVIDERS[0]
const CHANGED_FIELD = { BUDGET: 'monthlyRequestBudget', TOKEN: 'token' } as const

/**
 * Spec 262 (ADR-0102 §3): a chave da FeriadosAPI e o orçamento da INSTALAÇÃO — tabela global, sem `company_id`, e este
 * é o único arquivo que a importa (contrato `holiday-import-global-isolation`). A linha crua nunca sai daqui:
 * `toRecord` escolhe o que a API enxerga (nunca o envelope, nunca quem alterou). A auditoria cai na empresa do ator.
 */
export class DrizzleHolidayProviderSettingsRepository implements HolidayProviderSettingsPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async find(): Promise<HolidayProviderSettingsRecord | null> {
    const [row] = await this.database
      .select()
      .from(holidayProviderSettings)
      .where(eq(holidayProviderSettings.provider, PROVIDER))
      .limit(1)

    return row === undefined ? null : toRecord(row)
  }

  public async save(
    input: SaveHolidayProviderSettingsInput,
  ): Promise<HolidayProviderSettingsRecord> {
    return this.database.transaction((transaction) =>
      input.expectedVersion === undefined
        ? createSettings({ input, transaction })
        : updateSettings({ expectedVersion: input.expectedVersion, input, transaction }),
    )
  }

  public async removeToken(input: BusinessCalendarActor): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [previous] = await transaction
        .select()
        .from(holidayProviderSettings)
        .where(eq(holidayProviderSettings.provider, PROVIDER))
        .for('update')
        .limit(1)
      if (previous === undefined || previous.tokenEnvelope === null) return

      const row = requirePersistedRow(
        (
          await transaction
            .update(holidayProviderSettings)
            .set({
              tokenEnvelope: null,
              tokenHint: null,
              tokenUpdatedAt: null,
              updatedAt: new Date(),
              updatedByUserId: input.userId,
              version: previous.version + 1n,
            })
            .where(eq(holidayProviderSettings.id, previous.id))
            .returning()
        )[0],
      )
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_PROVIDER_TOKEN_REMOVED,
        actor: input,
        after: row,
        before: previous,
        changedFields: [CHANGED_FIELD.TOKEN],
        transaction,
      })
    })
  }
}

async function createSettings(params: {
  readonly input: SaveHolidayProviderSettingsInput
  readonly transaction: BusinessCalendarTransaction
}): Promise<HolidayProviderSettingsRecord> {
  const { input, transaction } = params
  const [row] = await transaction
    .insert(holidayProviderSettings)
    .values({
      id: input.settingsId,
      monthlyRequestBudget:
        input.monthlyRequestBudget ?? FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
      updatedByUserId: input.userId,
      ...tokenColumns(input.sealedToken),
    })
    .onConflictDoNothing({ target: holidayProviderSettings.provider })
    .returning()
  // Perdeu a corrida de criação: o envelope recém-selado (com o id que não vingou) é descartado.
  if (row === undefined) throw new HolidayProviderSettingsVersionConflictError()

  await audit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_PROVIDER_SETTINGS_SAVED,
    actor: input,
    after: row,
    before: null,
    changedFields: listChangedFields({ input, previous: undefined }),
    transaction,
  })
  return toRecord(row)
}

async function updateSettings(params: {
  readonly expectedVersion: bigint
  readonly input: SaveHolidayProviderSettingsInput
  readonly transaction: BusinessCalendarTransaction
}): Promise<HolidayProviderSettingsRecord> {
  const { expectedVersion, input, transaction } = params
  const [previous] = await transaction
    .select()
    .from(holidayProviderSettings)
    .where(eq(holidayProviderSettings.id, input.settingsId))
    .for('update')
    .limit(1)
  if (previous === undefined || previous.version !== expectedVersion) {
    throw new HolidayProviderSettingsVersionConflictError()
  }

  const changedFields = listChangedFields({ input, previous })
  // Salvar a mesma configuração não grava nem audita.
  if (changedFields.length === 0) return toRecord(previous)

  const row = (
    await transaction
      .update(holidayProviderSettings)
      .set({
        ...(changedFields.includes(CHANGED_FIELD.BUDGET) && input.monthlyRequestBudget !== undefined
          ? { monthlyRequestBudget: input.monthlyRequestBudget }
          : {}),
        ...tokenColumns(input.sealedToken),
        updatedAt: new Date(),
        updatedByUserId: input.userId,
        version: previous.version + 1n,
      })
      .where(
        and(
          eq(holidayProviderSettings.id, previous.id),
          eq(holidayProviderSettings.version, expectedVersion),
        ),
      )
      .returning()
  )[0]
  if (row === undefined) throw new HolidayProviderSettingsVersionConflictError()

  await audit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_PROVIDER_SETTINGS_SAVED,
    actor: input,
    after: row,
    before: previous,
    changedFields,
    transaction,
  })
  return toRecord(row)
}

function tokenColumns(sealed: SealedHolidayProviderToken | undefined) {
  return sealed === undefined
    ? {}
    : { tokenEnvelope: sealed.envelope, tokenHint: sealed.hint, tokenUpdatedAt: new Date() }
}

/** Em ordem alfabética: é o que a trilha grava em `metadata.changedFields`. */
function listChangedFields(params: {
  readonly input: SaveHolidayProviderSettingsInput
  readonly previous: SettingsRow | undefined
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
function toSnapshot(row: SettingsRow): Record<string, unknown> {
  return {
    monthlyRequestBudget: row.monthlyRequestBudget,
    tokenConfigured: row.tokenEnvelope !== null,
    version: row.version.toString(),
  }
}

async function audit(params: {
  readonly action: string
  readonly actor: BusinessCalendarActor
  readonly after: SettingsRow
  readonly before: SettingsRow | null
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

function toRecord(row: SettingsRow): HolidayProviderSettingsRecord {
  return {
    id: row.id,
    monthlyRequestBudget: row.monthlyRequestBudget,
    tokenConfigured: row.tokenEnvelope !== null,
    tokenHint: row.tokenHint,
    tokenUpdatedAt: row.tokenUpdatedAt,
    updatedAt: row.updatedAt,
    version: row.version,
  }
}
