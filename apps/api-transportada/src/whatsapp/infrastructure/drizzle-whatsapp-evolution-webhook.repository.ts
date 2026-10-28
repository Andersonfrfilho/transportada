/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { and, eq, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { whatsappEvolutionSettings } from '../../database/whatsapp-evolution.schema.js'
import type { WhatsAppEvolutionWebhookRepositoryPort } from '../application/whatsapp-evolution-webhook.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ENTITY_TYPE = 'whatsapp_evolution_settings'

/** O envelope da chave nasce `{}` quando ainda não há chave; só o que tem `ciphertext` é envelope. */
function toEnvelope(value: unknown): SecretEnvelopeV1 | null {
  return typeof value === 'object' && value !== null && 'ciphertext' in value
    ? (value as SecretEnvelopeV1)
    : null
}

/** Spec 281 T6: as colunas do webhook em `whatsapp_evolution_settings`, ao lado das da T4. */
export function createDrizzleWhatsAppEvolutionWebhookRepository(
  database: Database,
): WhatsAppEvolutionWebhookRepositoryPort {
  return {
    async findByWebhookId({ webhookId }) {
      const [row] = await database
        .select({
          companyId: whatsappEvolutionSettings.companyId,
          instanceName: whatsappEvolutionSettings.instanceName,
          settingsId: whatsappEvolutionSettings.id,
          status: whatsappEvolutionSettings.status,
          webhookEnvelope: whatsappEvolutionSettings.webhookSecretEnvelope,
        })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.webhookId, webhookId))
        .limit(1)
      return row === undefined ? null : { ...row, webhookEnvelope: toEnvelope(row.webhookEnvelope) }
    },

    async findRegistration({ companyId }) {
      const [row] = await database
        .select({
          apiKeyEnvelope: whatsappEvolutionSettings.secretEnvelope,
          baseUrl: whatsappEvolutionSettings.baseUrl,
          instanceName: whatsappEvolutionSettings.instanceName,
          registeredAt: whatsappEvolutionSettings.webhookRegisteredAt,
          settingsId: whatsappEvolutionSettings.id,
          status: whatsappEvolutionSettings.status,
          webhookEnvelope: whatsappEvolutionSettings.webhookSecretEnvelope,
          webhookId: whatsappEvolutionSettings.webhookId,
        })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, companyId))
        .limit(1)
      if (row === undefined) return null
      const apiKeyEnvelope = toEnvelope(row.apiKeyEnvelope)
      if (apiKeyEnvelope === null) return null
      return { ...row, apiKeyEnvelope, webhookEnvelope: toEnvelope(row.webhookEnvelope) }
    },

    async markRegistered({ audit, companyId, rotated, settingsId }) {
      return database.transaction(async (transaction) => {
        const [row] = await transaction
          .update(whatsappEvolutionSettings)
          .set({ webhookRegisteredAt: sql`now()` })
          .where(
            and(
              eq(whatsappEvolutionSettings.companyId, companyId),
              eq(whatsappEvolutionSettings.id, settingsId),
            ),
          )
          .returning({ registeredAt: whatsappEvolutionSettings.webhookRegisteredAt })
        if (row?.registeredAt == null) throw new Error('whatsapp evolution settings disappeared')

        await transaction.insert(auditLogs).values({
          action: audit.action,
          actorUserId: audit.actorUserId,
          // Nunca a URL nem o segredo: só se ele foi trocado.
          afterSnapshot: { rotated },
          beforeSnapshot: null,
          companyId,
          correlationId: audit.correlationId,
          entityId: settingsId,
          entityType: ENTITY_TYPE,
          permission: 'settings.manage',
          targetId: settingsId,
          targetType: ENTITY_TYPE,
        })
        return row.registeredAt
      })
    },

    async recordDelivery({ companyId, connectionState }) {
      await database
        .update(whatsappEvolutionSettings)
        .set({
          lastWebhookAt: sql`now()`,
          ...(connectionState === undefined
            ? {}
            : { connectionCheckedAt: sql`now()`, connectionState }),
        })
        .where(eq(whatsappEvolutionSettings.companyId, companyId))
    },

    async storeSecret({ companyId, envelope, settingsId }) {
      await database
        .update(whatsappEvolutionSettings)
        .set({ webhookRegisteredAt: null, webhookSecretEnvelope: envelope })
        .where(
          and(
            eq(whatsappEvolutionSettings.companyId, companyId),
            eq(whatsappEvolutionSettings.id, settingsId),
          ),
        )
    },
  }
}
