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
  DEFAULT_CANHOTO_OCR_ENABLED,
  DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
  type CompanyDeliveryProofSettings,
  type DeliveryProofFieldSettings,
  type DeliveryProofFieldSettingsInput,
  type DeliveryProofSettingsInput,
} from '../domain/delivery-proof-settings.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type DeliveryProofSettingsOverride = DeliveryProofFieldSettings & {
  readonly taxId: string
}

/** Spec 193 D6: no `PUT` de exceções, `receivedBy` ausente preserva o valor do mesmo `taxId`. */
export type DeliveryProofSettingsOverrideInput = DeliveryProofFieldSettingsInput & {
  readonly taxId: string
}

export class DrizzleDeliveryProofSettingsRepository {
  public constructor(private readonly database: Database) {}

  /** Ausência de linha é o padrão de fábrica — a leitura nunca devolve "não configurado". */
  public async readSettings(input: {
    readonly companyId: string
  }): Promise<CompanyDeliveryProofSettings> {
    const [record] = await this.database
      .select({
        canhotoOcrEnabled: companyDeliveryProofSettings.canhotoOcrEnabled,
        latePenaltyPoints: companyDeliveryProofSettings.latePenaltyPoints,
        missingAfterHours: companyDeliveryProofSettings.missingAfterHours,
        missingPenaltyPoints: companyDeliveryProofSettings.missingPenaltyPoints,
        photo: companyDeliveryProofSettings.photo,
        proofRadiusMeters: companyDeliveryProofSettings.proofRadiusMeters,
        proofWindowMinutes: companyDeliveryProofSettings.proofWindowMinutes,
        receivedBy: companyDeliveryProofSettings.receivedBy,
        receiverDocument: companyDeliveryProofSettings.receiverDocument,
        receiverName: companyDeliveryProofSettings.receiverName,
        signature: companyDeliveryProofSettings.signature,
      })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    return record ?? DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS
  }

  /**
   * ADR-0069 §6: a leitura estreita do escritório (`trip.report-on-behalf`) — só o interruptor,
   * nunca a configuração inteira, que é `settings.manage`.
   */
  public async readCanhotoOcrEnabled(input: { readonly companyId: string }): Promise<boolean> {
    const [record] = await this.database
      .select({ canhotoOcrEnabled: companyDeliveryProofSettings.canhotoOcrEnabled })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    return record?.canhotoOcrEnabled ?? DEFAULT_CANHOTO_OCR_ENABLED
  }

  /** Interruptor ausente no `input` não é gravado: nem cria ligado, nem desliga o que estava ligado. */
  public async saveSettings(input: {
    readonly companyId: string
    readonly settings: DeliveryProofSettingsInput
  }): Promise<CompanyDeliveryProofSettings> {
    await this.database
      .insert(companyDeliveryProofSettings)
      .values({ companyId: input.companyId, ...input.settings })
      .onConflictDoUpdate({
        set: { ...input.settings, updatedAt: new Date() },
        target: companyDeliveryProofSettings.companyId,
      })

    return this.readSettings({ companyId: input.companyId })
  }

  public async listOverrides(input: {
    readonly companyId: string
  }): Promise<readonly DeliveryProofSettingsOverride[]> {
    return this.database
      .select({
        photo: deliveryProofSettingOverrides.photo,
        receivedBy: deliveryProofSettingOverrides.receivedBy,
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
    readonly overrides: readonly DeliveryProofSettingsOverrideInput[]
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
              ...(override.receivedBy === undefined ? {} : { receivedBy: override.receivedBy }),
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
