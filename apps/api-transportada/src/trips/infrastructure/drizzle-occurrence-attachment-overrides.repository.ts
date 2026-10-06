/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B1/RF-B3: as duas tabelas de exceção do `attachmentMode` de um tipo de ocorrência,
 * por contratante e por destinatário — mesmo molde de `DrizzleDeliveryProofSettingsRepository`.
 * Toda consulta e toda escrita com o `companyId` do contexto no `where` — a exceção de uma empresa
 * nunca vaza para o cadastro de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
} from '../../database/trip.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import {
  rethrowOverrideShapeViolation,
  toOverrideRequirementInsert,
  toOverrideRequirementUpdate,
  type OccurrenceOverrideRequirementFields,
} from './occurrence-override-requirement-columns.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type OccurrenceAttachmentContractorOverride = OccurrenceOverrideRequirementFields & {
  readonly attachmentMode: DeliveryProofFieldMode
  readonly contractorId: string
}

export type OccurrenceAttachmentRecipientOverride = OccurrenceOverrideRequirementFields & {
  readonly attachmentMode: DeliveryProofFieldMode
  readonly taxId: string
}

export type OccurrenceTypeOverridesByType = {
  readonly contractorOverrides: readonly (OccurrenceAttachmentContractorOverride & {
    readonly occurrenceTypeId: string
  })[]
  readonly recipientOverrides: readonly (OccurrenceAttachmentRecipientOverride & {
    readonly occurrenceTypeId: string
  })[]
}

export class DrizzleOccurrenceAttachmentOverridesRepository {
  public constructor(private readonly database: Database) {}

  public async listContractorOverrides(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<readonly OccurrenceAttachmentContractorOverride[]> {
    return this.database
      .select({
        attachmentMode: companyOccurrenceTypeContractorOverrides.attachmentMode,
        contractorId: companyOccurrenceTypeContractorOverrides.contractorId,
        itemsMinimumCount: companyOccurrenceTypeContractorOverrides.itemsMinimumCount,
        itemsMode: companyOccurrenceTypeContractorOverrides.itemsMode,
        noteMode: companyOccurrenceTypeContractorOverrides.noteMode,
        photoMinimumCount: companyOccurrenceTypeContractorOverrides.photoMinimumCount,
        signatureMode: companyOccurrenceTypeContractorOverrides.signatureMode,
      })
      .from(companyOccurrenceTypeContractorOverrides)
      .where(
        and(
          eq(companyOccurrenceTypeContractorOverrides.companyId, input.companyId),
          eq(companyOccurrenceTypeContractorOverrides.occurrenceTypeId, input.occurrenceTypeId),
        ),
      )
      .orderBy(asc(companyOccurrenceTypeContractorOverrides.contractorId))
  }

  public async listRecipientOverrides(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<readonly OccurrenceAttachmentRecipientOverride[]> {
    return this.database
      .select({
        attachmentMode: companyOccurrenceTypeRecipientOverrides.attachmentMode,
        itemsMinimumCount: companyOccurrenceTypeRecipientOverrides.itemsMinimumCount,
        itemsMode: companyOccurrenceTypeRecipientOverrides.itemsMode,
        noteMode: companyOccurrenceTypeRecipientOverrides.noteMode,
        photoMinimumCount: companyOccurrenceTypeRecipientOverrides.photoMinimumCount,
        signatureMode: companyOccurrenceTypeRecipientOverrides.signatureMode,
        taxId: companyOccurrenceTypeRecipientOverrides.taxId,
      })
      .from(companyOccurrenceTypeRecipientOverrides)
      .where(
        and(
          eq(companyOccurrenceTypeRecipientOverrides.companyId, input.companyId),
          eq(companyOccurrenceTypeRecipientOverrides.occurrenceTypeId, input.occurrenceTypeId),
        ),
      )
      .orderBy(asc(companyOccurrenceTypeRecipientOverrides.taxId))
  }

  /**
   * `PUT` de coleção: o corpo é o conjunto inteiro para este tipo, e o que não veio sai. `contractorId`
   * é conferido contra o tenant antes de escrever, para responder 404 limpo em vez da FK crua.
   */
  public async replaceContractorOverrides(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly overrides: readonly OccurrenceAttachmentContractorOverride[]
  }): Promise<void> {
    const requestedContractorIds = [
      ...new Set(input.overrides.map((override) => override.contractorId)),
    ]
    if (requestedContractorIds.length > 0) {
      const foundContractors = await this.database
        .select({ id: contractors.id })
        .from(contractors)
        .where(
          and(
            eq(contractors.companyId, input.companyId),
            inArray(contractors.id, requestedContractorIds),
          ),
        )
      const foundContractorIds = new Set(foundContractors.map((row) => row.id))
      const isEveryContractorInTenant = requestedContractorIds.every((id) =>
        foundContractorIds.has(id),
      )
      if (!isEveryContractorInTenant) throw new ContractorNotFoundError()
    }

    try {
      await this.database.transaction(async (transaction) => {
        const keptContractorIds = input.overrides.map((override) => override.contractorId)
        await transaction
          .delete(companyOccurrenceTypeContractorOverrides)
          .where(
            and(
              eq(companyOccurrenceTypeContractorOverrides.companyId, input.companyId),
              eq(companyOccurrenceTypeContractorOverrides.occurrenceTypeId, input.occurrenceTypeId),
              keptContractorIds.length === 0
                ? undefined
                : notInArray(
                    companyOccurrenceTypeContractorOverrides.contractorId,
                    keptContractorIds,
                  ),
            ),
          )

        for (const override of input.overrides) {
          await transaction
            .insert(companyOccurrenceTypeContractorOverrides)
            .values({
              ...toOverrideRequirementInsert(override),
              companyId: input.companyId,
              contractorId: override.contractorId,
              occurrenceTypeId: input.occurrenceTypeId,
            })
            .onConflictDoUpdate({
              set: toOverrideRequirementUpdate(override),
              target: [
                companyOccurrenceTypeContractorOverrides.companyId,
                companyOccurrenceTypeContractorOverrides.occurrenceTypeId,
                companyOccurrenceTypeContractorOverrides.contractorId,
              ],
            })
        }
      })
    } catch (error: unknown) {
      rethrowOverrideShapeViolation(error)
    }
  }

  /** Sem pré-validação do `taxId` — mesma assimetria da irmã de comprovante (`replaceOverrides`). */
  public async replaceRecipientOverrides(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly overrides: readonly OccurrenceAttachmentRecipientOverride[]
  }): Promise<void> {
    try {
      await this.database.transaction(async (transaction) => {
        const keptTaxIds = input.overrides.map((override) => override.taxId)
        await transaction
          .delete(companyOccurrenceTypeRecipientOverrides)
          .where(
            and(
              eq(companyOccurrenceTypeRecipientOverrides.companyId, input.companyId),
              eq(companyOccurrenceTypeRecipientOverrides.occurrenceTypeId, input.occurrenceTypeId),
              keptTaxIds.length === 0
                ? undefined
                : notInArray(companyOccurrenceTypeRecipientOverrides.taxId, keptTaxIds),
            ),
          )

        for (const override of input.overrides) {
          await transaction
            .insert(companyOccurrenceTypeRecipientOverrides)
            .values({
              ...toOverrideRequirementInsert(override),
              companyId: input.companyId,
              occurrenceTypeId: input.occurrenceTypeId,
              taxId: override.taxId,
            })
            .onConflictDoUpdate({
              set: toOverrideRequirementUpdate(override),
              target: [
                companyOccurrenceTypeRecipientOverrides.companyId,
                companyOccurrenceTypeRecipientOverrides.occurrenceTypeId,
                companyOccurrenceTypeRecipientOverrides.taxId,
              ],
            })
        }
      })
    } catch (error: unknown) {
      rethrowOverrideShapeViolation(error)
    }
  }

  /**
   * Spec 218 T9: a leitura em lote que `list-field-occurrence-types.use-case.ts` usa para resolver
   * o `attachmentMode` efetivo de vários tipos de uma vez — uma consulta por tabela, nunca uma por
   * tipo.
   */
  public async listOverridesForTypes(input: {
    readonly companyId: string
    readonly occurrenceTypeIds: readonly string[]
  }): Promise<OccurrenceTypeOverridesByType> {
    if (input.occurrenceTypeIds.length === 0) {
      return { contractorOverrides: [], recipientOverrides: [] }
    }

    const [contractorOverrides, recipientOverrides] = await Promise.all([
      this.database
        .select({
          attachmentMode: companyOccurrenceTypeContractorOverrides.attachmentMode,
          contractorId: companyOccurrenceTypeContractorOverrides.contractorId,
          itemsMinimumCount: companyOccurrenceTypeContractorOverrides.itemsMinimumCount,
          itemsMode: companyOccurrenceTypeContractorOverrides.itemsMode,
          noteMode: companyOccurrenceTypeContractorOverrides.noteMode,
          occurrenceTypeId: companyOccurrenceTypeContractorOverrides.occurrenceTypeId,
          photoMinimumCount: companyOccurrenceTypeContractorOverrides.photoMinimumCount,
          signatureMode: companyOccurrenceTypeContractorOverrides.signatureMode,
        })
        .from(companyOccurrenceTypeContractorOverrides)
        .where(
          and(
            eq(companyOccurrenceTypeContractorOverrides.companyId, input.companyId),
            inArray(companyOccurrenceTypeContractorOverrides.occurrenceTypeId, [
              ...input.occurrenceTypeIds,
            ]),
          ),
        ),
      this.database
        .select({
          attachmentMode: companyOccurrenceTypeRecipientOverrides.attachmentMode,
          itemsMinimumCount: companyOccurrenceTypeRecipientOverrides.itemsMinimumCount,
          itemsMode: companyOccurrenceTypeRecipientOverrides.itemsMode,
          noteMode: companyOccurrenceTypeRecipientOverrides.noteMode,
          occurrenceTypeId: companyOccurrenceTypeRecipientOverrides.occurrenceTypeId,
          photoMinimumCount: companyOccurrenceTypeRecipientOverrides.photoMinimumCount,
          signatureMode: companyOccurrenceTypeRecipientOverrides.signatureMode,
          taxId: companyOccurrenceTypeRecipientOverrides.taxId,
        })
        .from(companyOccurrenceTypeRecipientOverrides)
        .where(
          and(
            eq(companyOccurrenceTypeRecipientOverrides.companyId, input.companyId),
            inArray(companyOccurrenceTypeRecipientOverrides.occurrenceTypeId, [
              ...input.occurrenceTypeIds,
            ]),
          ),
        ),
    ])

    return { contractorOverrides, recipientOverrides }
  }
}
