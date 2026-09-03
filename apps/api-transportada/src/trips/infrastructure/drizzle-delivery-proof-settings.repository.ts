/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0057 §1: a configuração do comprovante, geral e por CNPJ do destinatário. Toda consulta e
 * toda escrita com o `companyId` do contexto no `where` — a exceção de uma empresa não vaza para o
 * formulário de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, notInArray } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type DeliveryProofSettingsOverride = DeliveryProofFieldSettings & {
  readonly taxId: string
}

export class DrizzleDeliveryProofSettingsRepository {
  public constructor(private readonly database: Database) {}

  /** Ausência de linha é o padrão de fábrica — a leitura nunca devolve "não configurado". */
  public async readSettings(input: {
    readonly companyId: string
  }): Promise<DeliveryProofFieldSettings> {
    const [record] = await this.database
      .select({
        photo: companyDeliveryProofSettings.photo,
        receiverDocument: companyDeliveryProofSettings.receiverDocument,
        receiverName: companyDeliveryProofSettings.receiverName,
        signature: companyDeliveryProofSettings.signature,
      })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    return record ?? DEFAULT_DELIVERY_PROOF_SETTINGS
  }

  public async saveSettings(input: {
    readonly companyId: string
    readonly settings: DeliveryProofFieldSettings
  }): Promise<DeliveryProofFieldSettings> {
    await this.database
      .insert(companyDeliveryProofSettings)
      .values({ companyId: input.companyId, ...input.settings })
      .onConflictDoUpdate({
        set: { ...input.settings, updatedAt: new Date() },
        target: companyDeliveryProofSettings.companyId,
      })

    return input.settings
  }

  public async listOverrides(input: {
    readonly companyId: string
  }): Promise<readonly DeliveryProofSettingsOverride[]> {
    return this.database
      .select({
        photo: deliveryProofSettingOverrides.photo,
        receiverDocument: deliveryProofSettingOverrides.receiverDocument,
        receiverName: deliveryProofSettingOverrides.receiverName,
        signature: deliveryProofSettingOverrides.signature,
        taxId: deliveryProofSettingOverrides.taxId,
      })
      .from(deliveryProofSettingOverrides)
      .where(eq(deliveryProofSettingOverrides.companyId, input.companyId))
      .orderBy(asc(deliveryProofSettingOverrides.taxId))
  }

  /**
   * `PUT` de coleção: o corpo é o conjunto inteiro, e o que não veio sai. Idempotente por
   * construção — repetir o mesmo corpo converge no mesmo estado.
   */
  public async replaceOverrides(input: {
    readonly companyId: string
    readonly overrides: readonly DeliveryProofSettingsOverride[]
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const keptTaxIds = input.overrides.map((override) => override.taxId)
      await transaction
        .delete(deliveryProofSettingOverrides)
        .where(
          keptTaxIds.length === 0
            ? eq(deliveryProofSettingOverrides.companyId, input.companyId)
            : and(
                eq(deliveryProofSettingOverrides.companyId, input.companyId),
                notInArray(deliveryProofSettingOverrides.taxId, keptTaxIds),
              ),
        )

      for (const override of input.overrides) {
        await transaction
          .insert(deliveryProofSettingOverrides)
          .values({ companyId: input.companyId, ...override })
          .onConflictDoUpdate({
            set: {
              photo: override.photo,
              receiverDocument: override.receiverDocument,
              receiverName: override.receiverName,
              signature: override.signature,
              updatedAt: new Date(),
            },
            target: [deliveryProofSettingOverrides.companyId, deliveryProofSettingOverrides.taxId],
          })
      }
    })
  }
}
