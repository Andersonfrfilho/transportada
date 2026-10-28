/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { eq, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { whatsappEvolutionSettings } from '../../database/whatsapp-evolution.schema.js'
import type {
  WhatsAppEvolutionCredential,
  WhatsAppEvolutionRepositoryPort,
  WhatsAppEvolutionSaveRecord,
  WhatsAppEvolutionSummary,
} from '../application/whatsapp-evolution.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ENTITY_TYPE = 'whatsapp_evolution_settings'

/** `?` do jsonb: a chave do envelope existir, sem o segredo subir na projeção. */
const HAS_SEALED_KEY = sql<boolean>`${whatsappEvolutionSettings.secretEnvelope} ? 'ciphertext'`

const SUMMARY_COLUMNS = {
  baseUrl: whatsappEvolutionSettings.baseUrl,
  connectionCheckedAt: whatsappEvolutionSettings.connectionCheckedAt,
  connectionState: whatsappEvolutionSettings.connectionState,
  createdAt: whatsappEvolutionSettings.createdAt,
  dailyCap: whatsappEvolutionSettings.dailyCap,
  defaultProvider: whatsappEvolutionSettings.defaultProvider,
  id: whatsappEvolutionSettings.id,
  instanceName: whatsappEvolutionSettings.instanceName,
  minIntervalSeconds: whatsappEvolutionSettings.minIntervalSeconds,
  riskAcknowledgedAt: whatsappEvolutionSettings.riskAcknowledgedAt,
  status: whatsappEvolutionSettings.status,
  updatedAt: whatsappEvolutionSettings.updatedAt,
  version: whatsappEvolutionSettings.version,
} as const

export class DrizzleWhatsAppEvolutionRepository implements WhatsAppEvolutionRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<WhatsAppEvolutionSummary | null> {
    const [row] = await this.database
      .select({ ...SUMMARY_COLUMNS, hasKey: HAS_SEALED_KEY })
      .from(whatsappEvolutionSettings)
      .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toSummary(row)
  }

  public async findCredential(input: {
    readonly companyId: string
  }): Promise<WhatsAppEvolutionCredential | null> {
    const [row] = await this.database
      .select({
        baseUrl: whatsappEvolutionSettings.baseUrl,
        envelope: whatsappEvolutionSettings.secretEnvelope,
        id: whatsappEvolutionSettings.id,
        instanceName: whatsappEvolutionSettings.instanceName,
        status: whatsappEvolutionSettings.status,
      })
      .from(whatsappEvolutionSettings)
      .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
      .limit(1)

    if (row === undefined) return null

    return {
      baseUrl: row.baseUrl,
      companyId: input.companyId,
      envelope: row.envelope as SecretEnvelopeV1,
      instanceName: row.instanceName,
      settingsId: row.id,
      status: row.status,
    }
  }

  public async recordConnection(
    input: Parameters<WhatsAppEvolutionRepositoryPort['recordConnection']>[0],
  ): Promise<WhatsAppEvolutionSummary | null> {
    return this.database.transaction(async (transaction) => {
      const [previous] = await transaction
        .select({
          id: whatsappEvolutionSettings.id,
          state: whatsappEvolutionSettings.connectionState,
        })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
        .for('update')
        .limit(1)
      if (previous === undefined) return null

      const [row] = await transaction
        .update(whatsappEvolutionSettings)
        .set({ connectionCheckedAt: sql`now()`, connectionState: input.state })
        .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
        .returning({ ...SUMMARY_COLUMNS, hasKey: HAS_SEALED_KEY })

      if (input.audit !== undefined && previous.state !== input.state) {
        await transaction.insert(auditLogs).values({
          action: input.audit.action,
          actorUserId: input.audit.actorUserId,
          afterSnapshot: { state: input.state },
          beforeSnapshot: { state: previous.state },
          companyId: input.companyId,
          correlationId: input.audit.correlationId,
          entityId: previous.id,
          entityType: ENTITY_TYPE,
          permission: 'settings.manage',
          targetId: previous.id,
          targetType: ENTITY_TYPE,
        })
      }

      return row === undefined ? null : toSummary(row)
    })
  }

  public async recordQrRequest(
    input: Parameters<WhatsAppEvolutionRepositoryPort['recordQrRequest']>[0],
  ): Promise<void> {
    await this.database.insert(auditLogs).values({
      action: input.audit.action,
      actorUserId: input.audit.actorUserId,
      afterSnapshot: null,
      beforeSnapshot: null,
      companyId: input.companyId,
      correlationId: input.audit.correlationId,
      entityId: input.settingsId,
      entityType: ENTITY_TYPE,
      permission: 'settings.manage',
      targetId: input.settingsId,
      targetType: ENTITY_TYPE,
    })
  }

  /**
   * Um registro por empresa; `secretEnvelope` ausente **mantém o que está gravado**, para a tela
   * regravar endereço e limites sem pedir a chave de volta. O aviso de risco, uma vez lido, não se
   * desfaz (`coalesce`).
   */
  public async save(input: WhatsAppEvolutionSaveRecord): Promise<WhatsAppEvolutionSummary> {
    return this.database.transaction(async (transaction) => {
      const acknowledgedAt = input.riskAcknowledgedBy === undefined ? null : new Date()
      /**
       * ⚠️ Nada de `INSERT ... ON CONFLICT`: o Postgres confere os CHECKs na linha **proposta** antes
       * de cair no conflito, e regravar uma configuração `active` cujo aviso já foi lido propõe
       * `active` sem `risk_acknowledged_at` (23514). Quem existe vira UPDATE; só a empresa nova insere.
       */
      const [existing] = await transaction
        .select({ id: whatsappEvolutionSettings.id })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
        .for('update')
        .limit(1)

      const [row] =
        existing === undefined
          ? await transaction
              .insert(whatsappEvolutionSettings)
              .values({
                baseUrl: input.baseUrl,
                companyId: input.companyId,
                dailyCap: input.dailyCap,
                defaultProvider: input.defaultProvider,
                id: input.settingsId,
                instanceName: input.instanceName,
                minIntervalSeconds: input.minIntervalSeconds,
                riskAcknowledgedAt: acknowledgedAt,
                riskAcknowledgedBy: input.riskAcknowledgedBy ?? null,
                secretEnvelope: input.secretEnvelope ?? {},
                status: input.status,
              })
              .returning({ ...SUMMARY_COLUMNS, hasKey: HAS_SEALED_KEY })
          : await transaction
              .update(whatsappEvolutionSettings)
              .set({
                baseUrl: input.baseUrl,
                dailyCap: input.dailyCap,
                defaultProvider: input.defaultProvider,
                instanceName: input.instanceName,
                minIntervalSeconds: input.minIntervalSeconds,
                riskAcknowledgedAt: sql`coalesce(${whatsappEvolutionSettings.riskAcknowledgedAt}, ${acknowledgedAt})`,
                riskAcknowledgedBy: sql`coalesce(${whatsappEvolutionSettings.riskAcknowledgedBy}, ${input.riskAcknowledgedBy ?? null})`,
                status: input.status,
                updatedAt: sql`now()`,
                version: sql`${whatsappEvolutionSettings.version} + 1`,
                /**
                 * Spec 281 T6: endereço, instância ou chave novos são outro Evolution, e o webhook de lá
                 * ainda não aponta para nós; o próximo QR aponta de novo (o segredo é mantido).
                 */
                ...(input.resetConnection
                  ? {
                      connectionCheckedAt: null,
                      connectionState: 'unknown' as const,
                      webhookRegisteredAt: null,
                    }
                  : {}),
                ...(input.secretEnvelope === undefined
                  ? {}
                  : { secretEnvelope: input.secretEnvelope }),
              })
              .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
              .returning({ ...SUMMARY_COLUMNS, hasKey: HAS_SEALED_KEY })

      if (row === undefined) throw new Error('whatsapp evolution settings upsert returned no row')

      await transaction.insert(auditLogs).values({
        action: input.audit.action,
        actorUserId: input.audit.actorUserId,
        afterSnapshot: input.audit.afterSnapshot,
        beforeSnapshot: input.audit.beforeSnapshot,
        companyId: input.companyId,
        correlationId: input.audit.correlationId,
        entityId: row.id,
        entityType: ENTITY_TYPE,
        permission: 'settings.manage',
        targetId: row.id,
        targetType: ENTITY_TYPE,
      })

      return toSummary(row)
    })
  }
}

function toSummary(
  row: Readonly<{
    baseUrl: string
    connectionCheckedAt: Date | null
    connectionState: WhatsAppEvolutionSummary['connectionState']
    createdAt: Date
    dailyCap: number
    defaultProvider: WhatsAppEvolutionSummary['defaultProvider']
    hasKey: boolean
    id: string
    instanceName: string
    minIntervalSeconds: number
    riskAcknowledgedAt: Date | null
    status: WhatsAppEvolutionSummary['status']
    updatedAt: Date
    version: bigint
  }>,
): WhatsAppEvolutionSummary {
  return {
    apiKeyConfigured: row.hasKey,
    baseUrl: row.baseUrl,
    connectionCheckedAt: row.connectionCheckedAt?.toISOString() ?? null,
    connectionState: row.connectionState,
    createdAt: row.createdAt.toISOString(),
    dailyCap: row.dailyCap,
    defaultProvider: row.defaultProvider,
    id: row.id,
    instanceName: row.instanceName,
    minIntervalSeconds: row.minIntervalSeconds,
    riskAcknowledgedAt: row.riskAcknowledgedAt?.toISOString() ?? null,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version.toString(),
  }
}
