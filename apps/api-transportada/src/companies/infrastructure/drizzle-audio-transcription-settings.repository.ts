/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, sql } from 'drizzle-orm'

import { companyAudioTranscriptionSettings } from '../../database/company-audio-transcription-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  AudioTranscriptionSettingsPort,
  AudioTranscriptionStoredSettings,
  SaveAudioTranscriptionSettingsParams,
} from '../application/audio-transcription-settings.port.js'
import {
  AUDIO_TRANSCRIPTION_AUDIT_PERMISSION,
  AUDIO_TRANSCRIPTION_AUDIT_TARGET_TYPE,
  AUDIO_TRANSCRIPTION_CHANGED_ACTION,
  DEFAULT_AUDIO_TRANSCRIPTION_ENABLED,
} from '../domain/audio-transcription.constant.js'
import {
  COMPANY_SETTINGS_PERSISTENCE_FAILURE,
  CompanySettingsPersistenceError,
} from '../domain/company-settings-persistence.error.js'
import { acquireAudioTranscriptionLock } from './drizzle-company-settings.support.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'

type SettingsRow = typeof companyAudioTranscriptionSettings.$inferSelect

const DATABASE_NOW = sql`now()`

/** Uma linha por empresa; toda instrução é filtrada pelo tenant do contexto, e os horários são do banco. */
export class DrizzleAudioTranscriptionSettingsRepository implements AudioTranscriptionSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(params: {
    readonly companyId: string
  }): Promise<AudioTranscriptionStoredSettings> {
    const [row] = await this.database
      .select()
      .from(companyAudioTranscriptionSettings)
      .where(eq(companyAudioTranscriptionSettings.companyId, params.companyId))
      .limit(1)

    return toStoredSettings(row)
  }

  public async save(
    params: SaveAudioTranscriptionSettingsParams,
  ): Promise<AudioTranscriptionStoredSettings> {
    return this.database.transaction(async (transaction) => {
      const previous = await lockRow(transaction, params.companyId)
      const previousEnabled = previous?.enabled ?? DEFAULT_AUDIO_TRANSCRIPTION_ENABLED
      if (previousEnabled === params.enabled) return toStoredSettings(previous)

      const isReenabling = params.enabled && !previousEnabled
      const [row] = await transaction
        .insert(companyAudioTranscriptionSettings)
        .values({
          companyId: params.companyId,
          enabled: params.enabled,
          enabledSince: DATABASE_NOW,
          updatedAt: DATABASE_NOW,
          updatedByUserId: params.userId,
        })
        .onConflictDoUpdate({
          set: {
            enabled: params.enabled,
            ...(isReenabling ? { enabledSince: DATABASE_NOW } : {}),
            updatedAt: DATABASE_NOW,
            updatedByUserId: params.userId,
          },
          target: companyAudioTranscriptionSettings.companyId,
        })
        .returning()

      if (row === undefined) {
        throw new CompanySettingsPersistenceError(
          COMPANY_SETTINGS_PERSISTENCE_FAILURE.audioTranscriptionNotPersisted,
        )
      }
      await appendAudit(transaction, { actor: params, after: row.enabled, before: previousEnabled })

      return toStoredSettings(row)
    })
  }
}

/** `FOR UPDATE` não trava linha que ainda não existe: o lock por empresa serializa o primeiro PUT. */
async function lockRow(
  transaction: CompanySettingsTransaction,
  companyId: string,
): Promise<SettingsRow | undefined> {
  await acquireAudioTranscriptionLock(transaction, companyId)

  return transaction
    .select()
    .from(companyAudioTranscriptionSettings)
    .where(eq(companyAudioTranscriptionSettings.companyId, companyId))
    .limit(1)
    .for('update')
    .then((rows) => rows[0])
}

type AuditParams = {
  readonly actor: SaveAudioTranscriptionSettingsParams
  readonly after: boolean
  readonly before: boolean
}

/** Ator, empresa, valor antes e depois, IP e correlação; nenhum texto de conversa. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: AuditParams,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: AUDIO_TRANSCRIPTION_CHANGED_ACTION,
    actorUserId: params.actor.userId,
    afterSnapshot: { enabled: params.after },
    beforeSnapshot: { enabled: params.before },
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.actor.companyId,
    entityType: AUDIO_TRANSCRIPTION_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: AUDIO_TRANSCRIPTION_AUDIT_PERMISSION,
    targetId: params.actor.companyId,
    targetType: AUDIO_TRANSCRIPTION_AUDIT_TARGET_TYPE,
  })
}

function toStoredSettings(row: SettingsRow | undefined): AudioTranscriptionStoredSettings {
  if (row === undefined) return { enabled: DEFAULT_AUDIO_TRANSCRIPTION_ENABLED, updatedAt: null }

  return { enabled: row.enabled, updatedAt: row.updatedAt }
}
