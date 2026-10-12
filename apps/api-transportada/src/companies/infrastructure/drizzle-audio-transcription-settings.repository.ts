/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.1): a decisão da empresa sobre a transcrição, no Postgres. Uma linha por empresa
 * (`company_id` é a chave primária); toda instrução filtra pelo tenant do contexto. `updated_at` e `enabled_since`
 * são do relógio do banco, o mesmo que a rotina compara. A auditoria vai na mesma transação e só quando o valor muda.
 */
import { eq, sql } from 'drizzle-orm'

import { companyAudioTranscriptionSettings } from '../../database/conversation-audio-transcription.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  AudioTranscriptionActor,
  AudioTranscriptionSettings,
  AudioTranscriptionSettingsPort,
} from '../application/audio-transcription-settings.port.js'
import {
  AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_PERMISSION,
  AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_TARGET_TYPE,
  AUDIO_TRANSCRIPTION_SETTINGS_CHANGED_ACTION,
  DEFAULT_AUDIO_TRANSCRIPTION_ENABLED,
} from '../domain/audio-transcription-settings.constant.js'
import {
  COMPANY_SETTINGS_PERSISTENCE_FAILURE,
  CompanySettingsPersistenceError,
} from '../domain/company-settings-persistence.error.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'
import { acquireAudioTranscriptionLock } from './drizzle-company-settings.support.js'

type SettingsRow = typeof companyAudioTranscriptionSettings.$inferSelect

export class DrizzleAudioTranscriptionSettingsRepository implements AudioTranscriptionSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: { readonly companyId: string }): Promise<AudioTranscriptionSettings> {
    const [row] = await this.database
      .select()
      .from(companyAudioTranscriptionSettings)
      .where(eq(companyAudioTranscriptionSettings.companyId, input.companyId))
      .limit(1)

    return toSettings(row)
  }

  public async save(
    input: AudioTranscriptionActor & { readonly enabled: boolean },
  ): Promise<AudioTranscriptionSettings> {
    return this.database.transaction(async (transaction) => {
      const previous = await lockRow(transaction, input.companyId)
      const previousEnabled = previous?.enabled ?? DEFAULT_AUDIO_TRANSCRIPTION_ENABLED
      if (previousEnabled === input.enabled) return toSettings(previous)

      const [row] = await transaction
        .insert(companyAudioTranscriptionSettings)
        .values({
          companyId: input.companyId,
          enabled: input.enabled,
          enabledSince: sql`now()`,
          updatedAt: sql`now()`,
          updatedByUserId: input.userId,
        })
        .onConflictDoUpdate({
          set: {
            enabled: input.enabled,
            ...(input.enabled ? { enabledSince: sql`now()` } : {}),
            updatedAt: sql`now()`,
            updatedByUserId: input.userId,
          },
          target: companyAudioTranscriptionSettings.companyId,
        })
        .returning()
      if (row === undefined) {
        throw new CompanySettingsPersistenceError(
          COMPANY_SETTINGS_PERSISTENCE_FAILURE.audioTranscriptionNotPersisted,
        )
      }
      await appendAudit(transaction, {
        actor: input,
        after: { enabled: row.enabled },
        before: { enabled: previousEnabled },
      })

      return toSettings(row)
    })
  }
}

/** `FOR UPDATE` não trava linha que ainda não existe: o lock por empresa serializa a primeira escrita. */
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

type Snapshot = { readonly enabled: boolean }

/** Ator, empresa, antes/depois, correlação e IP; nada de texto de transcrição. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: {
    readonly actor: AudioTranscriptionActor
    readonly after: Snapshot
    readonly before: Snapshot
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: AUDIO_TRANSCRIPTION_SETTINGS_CHANGED_ACTION,
    actorUserId: params.actor.userId,
    afterSnapshot: params.after,
    beforeSnapshot: params.before,
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.actor.companyId,
    entityType: AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_PERMISSION,
    targetId: params.actor.companyId,
    targetType: AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_TARGET_TYPE,
  })
}

/** A linha criada pela rotina (`updated_by_user_id` nulo) ainda não é decisão de pessoa. */
function toSettings(row: SettingsRow | undefined): AudioTranscriptionSettings {
  return {
    enabled: row?.enabled ?? DEFAULT_AUDIO_TRANSCRIPTION_ENABLED,
    updatedAt: row === undefined || row.updatedByUserId === null ? null : row.updatedAt,
  }
}
