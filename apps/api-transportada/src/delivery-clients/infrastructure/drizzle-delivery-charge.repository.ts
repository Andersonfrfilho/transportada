/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, gte, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  contractors,
  deliveryChargeEvents,
  deliveryCharges,
  deliveryClientChargeRules,
  deliveryClients,
} from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import type {
  ChargeParties,
  DeliveryCharge,
  DeliveryChargeListFilters,
  DeliveryChargePage,
  DeliveryChargeRepositoryPort,
  DeliveryChargeRule,
  DeliveryChargeRuleRepositoryPort,
} from '../application/delivery-charge.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type ChargeRow = typeof deliveryCharges.$inferSelect

const RECIPIENT_ROLE = 'recipient'
const EMITTER_ROLE = 'emitter'

/** O emitente entra pela segunda vez na mesma tabela: sem alias, a junção casaria com o destinatário. */
const emitterParticipants = alias(nfeParticipants, 'emitter_participants')

export class DrizzleDeliveryChargeRepository implements DeliveryChargeRepositoryPort {
  public constructor(private readonly database: Database) {}

  /**
   * Spec 060 D1b: cliente e contratante saem **da nota**, num caminho só. O destinatário decide a
   * quem a taxa pertence; o emitente decide para quem ela será cobrada — e o contratante pode não
   * ter cadastro ainda, caso em que o lançamento nasce sem lote e aparece como "sem contratante".
   */
  public async findChargeParties(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<ChargeParties | null> {
    const [row] = await this.database
      .select({
        contractorId: contractors.id,
        deliveryClientId: deliveryClients.id,
        tripId: tripDocuments.tripId,
      })
      .from(tripDocuments)
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_ROLE),
        ),
      )
      .innerJoin(
        deliveryClients,
        and(
          eq(deliveryClients.companyId, nfeParticipants.companyId),
          eq(deliveryClients.taxId, nfeParticipants.taxId),
        ),
      )
      .leftJoin(
        emitterParticipants,
        and(
          eq(emitterParticipants.companyId, tripDocuments.companyId),
          eq(emitterParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(emitterParticipants.role, EMITTER_ROLE),
        ),
      )
      .leftJoin(
        contractors,
        and(
          eq(contractors.companyId, emitterParticipants.companyId),
          eq(contractors.taxId, emitterParticipants.taxId),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.id, input.tripDocumentId),
        ),
      )
      .limit(1)

    return row === undefined
      ? null
      : {
          contractorId: row.contractorId,
          deliveryClientId: row.deliveryClientId,
          tripId: row.tripId,
        }
  }

  public async findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<DeliveryCharge | null> {
    const [row] = await this.database
      .select()
      .from(deliveryCharges)
      .where(and(eq(deliveryCharges.companyId, input.companyId), eq(deliveryCharges.id, input.id)))
      .limit(1)

    return row === undefined ? null : toCharge(row)
  }

  public async insert(input: {
    readonly actorUserId: string | null
    readonly charge: Parameters<DeliveryChargeRepositoryPort['insert']>[0]['charge']
    readonly companyId: string
  }): Promise<DeliveryCharge | null> {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(deliveryCharges)
        .values({
          amount: input.charge.amount,
          chargedOn: input.charge.chargedOn,
          chargeType: input.charge.chargeType,
          companyId: input.companyId,
          contractorId: input.charge.parties.contractorId,
          deliveryClientId: input.charge.parties.deliveryClientId,
          notes: input.charge.notes,
          origin: input.charge.origin,
          recordedByUserId: input.actorUserId,
          status: input.charge.status,
          tripDocumentId: input.charge.tripDocumentId,
          tripId: input.charge.parties.tripId,
        })
        /** A segunda sugestão da mesma nota e tipo é recusada pelo índice parcial — e isso é o certo. */
        .onConflictDoNothing()
        .returning()
      if (created === undefined) return null

      await transaction.insert(deliveryChargeEvents).values({
        actorUserId: input.actorUserId,
        chargeId: created.id,
        companyId: input.companyId,
        eventName: input.charge.status === 'suggested' ? 'suggested' : 'recorded',
        payload: { amount: input.charge.amount, origin: input.charge.origin },
      })

      return toCharge(created)
    })
  }

  public async list(input: {
    readonly companyId: string
    readonly filters: DeliveryChargeListFilters
  }): Promise<DeliveryChargePage> {
    const { filters } = input
    const rows = await this.database
      .select()
      .from(deliveryCharges)
      .where(
        and(
          eq(deliveryCharges.companyId, input.companyId),
          ...(filters.cursor === undefined ? [] : [gt(deliveryCharges.id, filters.cursor)]),
          ...(filters.status === undefined ? [] : [eq(deliveryCharges.status, filters.status)]),
          ...(filters.contractorId === undefined
            ? []
            : [eq(deliveryCharges.contractorId, filters.contractorId)]),
          ...(filters.deliveryClientId === undefined
            ? []
            : [eq(deliveryCharges.deliveryClientId, filters.deliveryClientId)]),
          ...(filters.from === undefined ? [] : [gte(deliveryCharges.chargedOn, filters.from)]),
          ...(filters.to === undefined ? [] : [lte(deliveryCharges.chargedOn, filters.to)]),
        ),
      )
      .orderBy(asc(deliveryCharges.id))
      .limit(filters.limit + 1)

    const page = rows.slice(0, filters.limit)

    return {
      items: page.map(toCharge),
      nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
    }
  }

  public async transition(input: {
    readonly actorUserId: string | null
    readonly amount?: string
    readonly companyId: string
    readonly decidedByToken?: string
    readonly eventName: string
    readonly id: string
    readonly rejectionReason?: string
    readonly status: DeliveryCharge['status']
  }): Promise<DeliveryCharge | null> {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(deliveryCharges)
        .set({
          ...(input.amount === undefined ? {} : { amount: input.amount }),
          ...(input.rejectionReason === undefined
            ? {}
            : { rejectionReason: input.rejectionReason }),
          status: input.status,
          updatedAt: new Date(),
        })
        .where(
          and(eq(deliveryCharges.companyId, input.companyId), eq(deliveryCharges.id, input.id)),
        )
        .returning()
      if (updated === undefined) return null

      /** Trilha append-only: é dinheiro entre duas empresas, e "quem aprovou isso?" vai ser feita. */
      await transaction.insert(deliveryChargeEvents).values({
        actorUserId: input.actorUserId,
        chargeId: updated.id,
        companyId: input.companyId,
        ...(input.decidedByToken === undefined ? {} : { decidedByToken: input.decidedByToken }),
        eventName: input.eventName as 'recorded',
        payload: {
          ...(input.amount === undefined ? {} : { amount: input.amount }),
          ...(input.rejectionReason === undefined ? {} : { reason: input.rejectionReason }),
        },
      })

      return toCharge(updated)
    })
  }
}

export class DrizzleDeliveryChargeRuleRepository implements DeliveryChargeRuleRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async deactivate(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly ruleId: string
  }): Promise<boolean> {
    const deactivated = await this.database
      .update(deliveryClientChargeRules)
      .set({
        active: false,
        deactivatedAt: new Date(),
        deactivatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deliveryClientChargeRules.companyId, input.companyId),
          eq(deliveryClientChargeRules.id, input.ruleId),
          eq(deliveryClientChargeRules.active, true),
        ),
      )
      .returning({ id: deliveryClientChargeRules.id })

    return deactivated.length > 0
  }

  public async listActiveByClient(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<readonly DeliveryChargeRule[]> {
    const rows = await this.database
      .select()
      .from(deliveryClientChargeRules)
      .where(
        and(
          eq(deliveryClientChargeRules.companyId, input.companyId),
          eq(deliveryClientChargeRules.deliveryClientId, input.deliveryClientId),
          eq(deliveryClientChargeRules.active, true),
        ),
      )

    return rows.map(toRule)
  }

  public async listByClient(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<readonly DeliveryChargeRule[]> {
    const rows = await this.database
      .select()
      .from(deliveryClientChargeRules)
      .where(
        and(
          eq(deliveryClientChargeRules.companyId, input.companyId),
          eq(deliveryClientChargeRules.deliveryClientId, input.deliveryClientId),
        ),
      )
      .orderBy(asc(deliveryClientChargeRules.chargeType))

    return rows.map(toRule)
  }

  public async upsert(input: {
    readonly actorUserId: string
    readonly chargeType: DeliveryChargeRule['chargeType']
    readonly companyId: string
    readonly deliveryClientId: string
    readonly expectedAmount: string
  }): Promise<DeliveryChargeRule> {
    const [existing] = await this.database
      .select()
      .from(deliveryClientChargeRules)
      .where(
        and(
          eq(deliveryClientChargeRules.companyId, input.companyId),
          eq(deliveryClientChargeRules.deliveryClientId, input.deliveryClientId),
          eq(deliveryClientChargeRules.chargeType, input.chargeType),
          eq(deliveryClientChargeRules.active, true),
        ),
      )
      .limit(1)

    if (existing !== undefined) {
      const [updated] = await this.database
        .update(deliveryClientChargeRules)
        .set({ expectedAmount: input.expectedAmount, updatedAt: new Date() })
        .where(eq(deliveryClientChargeRules.id, existing.id))
        .returning()
      return toRule(updated as typeof deliveryClientChargeRules.$inferSelect)
    }

    const [created] = await this.database
      .insert(deliveryClientChargeRules)
      .values({
        activatedByUserId: input.actorUserId,
        chargeType: input.chargeType,
        companyId: input.companyId,
        deliveryClientId: input.deliveryClientId,
        expectedAmount: input.expectedAmount,
      })
      .returning()

    return toRule(created as typeof deliveryClientChargeRules.$inferSelect)
  }
}

function toCharge(row: ChargeRow): DeliveryCharge {
  return {
    amount: row.amount,
    batchId: row.batchId,
    chargedOn: row.chargedOn,
    chargeType: row.chargeType,
    contractorId: row.contractorId,
    deliveryClientId: row.deliveryClientId,
    id: row.id,
    notes: row.notes,
    origin: row.origin,
    rejectionReason: row.rejectionReason,
    status: row.status,
    tripDocumentId: row.tripDocumentId,
    tripId: row.tripId,
  }
}

function toRule(row: typeof deliveryClientChargeRules.$inferSelect): DeliveryChargeRule {
  return {
    active: row.active,
    chargeType: row.chargeType,
    deliveryClientId: row.deliveryClientId,
    expectedAmount: row.expectedAmount,
    id: row.id,
  }
}
