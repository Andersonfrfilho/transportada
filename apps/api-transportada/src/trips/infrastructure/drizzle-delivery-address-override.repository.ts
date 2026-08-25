/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, sql } from 'drizzle-orm'

import { nfeAddresses, nfeParticipants } from '../../database/database.schema.js'
import { deliveryAddressOverrides, tripDocuments, trips } from '../../database/trip.schema.js'
import type { ListDeliveryAddressHistoryPort } from '../application/list-delivery-address-history.use-case.js'
import type {
  DeliveryAddressOverrideRecord,
  OverrideDeliveryAddressPort,
  OverrideDeliveryAddressPreconditions,
} from '../application/override-delivery-address.use-case.js'
import { reconcileStopOnLink, reconcileStopOnUnlink } from '../application/reconcile-trip-stops.use-case.js'
import type { StopAddressComponents } from '../domain/stop-address-key.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import { resolveNfeDocumentId } from './nfe-destination-address.support.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

type OverrideRecord = typeof deliveryAddressOverrides.$inferSelect

function mapOverride(record: OverrideRecord): DeliveryAddressOverrideRecord {
  return {
    actorUserId: record.actorUserId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    newAddress: {
      cityCode: record.newCityCode,
      number: record.newNumber,
      postalCode: record.newPostalCode,
    },
    newLabel: record.newLabel,
    previousAddress: {
      cityCode: record.previousCityCode,
      number: record.previousNumber,
      postalCode: record.previousPostalCode,
    },
    previousLabel: record.previousLabel,
    reason: record.reason,
    requestedBy: record.requestedBy,
    tripDocumentId: record.tripDocumentId,
  }
}

export class DrizzleDeliveryAddressOverrideRepository
  implements OverrideDeliveryAddressPort, ListDeliveryAddressHistoryPort
{
  public constructor(private readonly database: TripDatabase) {}

  public async readPreconditions(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<OverrideDeliveryAddressPreconditions | null> {
    const [record] = await this.database
      .select({ status: trips.status, tripId: trips.id })
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.id, input.tripDocumentId),
        ),
      )
      .limit(1)
    if (record === undefined) return null

    return { tripId: record.tripId, tripStatus: record.status }
  }

  public async listHistory(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<readonly DeliveryAddressOverrideRecord[] | null> {
    const [document] = await this.database
      .select({ id: tripDocuments.id })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.id, input.tripDocumentId),
        ),
      )
      .limit(1)
    if (document === undefined) return null

    const records = await this.database
      .select()
      .from(deliveryAddressOverrides)
      .where(
        and(
          eq(deliveryAddressOverrides.companyId, input.companyId),
          eq(deliveryAddressOverrides.tripDocumentId, input.tripDocumentId),
        ),
      )
      .orderBy(desc(deliveryAddressOverrides.createdAt))
    return records.map(mapOverride)
  }

  public async applyOverride(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly newAddress: StopAddressComponents
    readonly newLabel: string
    readonly reason: string
    readonly requestedBy: string
    readonly tripDocumentId: string
    readonly tripId: string
  }): Promise<DeliveryAddressOverrideRecord> {
    return this.database.transaction(async (transaction) => {
      const [documentRow] = await transaction
        .select({
          freightCalculationId: tripDocuments.freightCalculationId,
          nfeDocumentId: tripDocuments.nfeDocumentId,
          stopId: tripDocuments.stopId,
        })
        .from(tripDocuments)
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            eq(tripDocuments.id, input.tripDocumentId),
          ),
        )
        .for('update')
        .limit(1)
      if (documentRow === undefined) throw new TripDocumentNotFoundError()

      const nfeDocumentId = await resolveNfeDocumentId(transaction, {
        companyId: input.companyId,
        freightCalculationId: documentRow.freightCalculationId,
        nfeDocumentId: documentRow.nfeDocumentId,
      })
      const previous = await resolvePreviousAddress(transaction, {
        companyId: input.companyId,
        nfeDocumentId,
        tripDocumentId: input.tripDocumentId,
      })

      // T007 documenta o motivo: `reconcileStopOnUnlink` só pode rodar depois de a nota já ter
      // perdido a referência à parada antiga — senão ela mesma se conta como razão para a parada
      // continuar ocupada, e nunca esvazia.
      await transaction
        .update(tripDocuments)
        .set({ stopId: null })
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            eq(tripDocuments.id, input.tripDocumentId),
          ),
        )

      const reconciliationPort = createTripStopReconciliationPort(transaction)
      await reconcileStopOnUnlink({
        companyId: input.companyId,
        repository: reconciliationPort,
        stopId: documentRow.stopId,
      })
      const nextStop = await reconcileStopOnLink({
        addressComponents: input.newAddress,
        companyId: input.companyId,
        label: input.newLabel,
        repository: reconciliationPort,
        tripId: input.tripId,
      })

      await transaction
        .update(tripDocuments)
        .set({ stopId: nextStop?.id ?? null, updatedAt: sql`now()` })
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            eq(tripDocuments.id, input.tripDocumentId),
          ),
        )

      const [created] = await transaction
        .insert(deliveryAddressOverrides)
        .values({
          actorUserId: input.actorUserId,
          companyId: input.companyId,
          newCityCode: input.newAddress.cityCode,
          newLabel: input.newLabel,
          newNumber: input.newAddress.number,
          newPostalCode: input.newAddress.postalCode,
          previousCityCode: previous.address.cityCode,
          previousLabel: previous.label,
          previousNumber: previous.address.number,
          previousPostalCode: previous.address.postalCode,
          reason: input.reason,
          requestedBy: input.requestedBy,
          tripDocumentId: input.tripDocumentId,
        })
        .returning()
      if (created === undefined) throw new Error('DELIVERY_ADDRESS_OVERRIDE_FAILED')
      return mapOverride(created)
    })
  }
}

/**
 * O par de "endereço anterior" tem duas fontes, na ordem certa: o último desvio já registrado (a
 * nota já foi redirecionada antes), ou o destinatário original da NF-e quando este é o primeiro
 * desvio dela.
 */
async function resolvePreviousAddress(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly nfeDocumentId: string | null
    readonly tripDocumentId: string
  },
): Promise<{ readonly address: StopAddressComponents; readonly label: string }> {
  const [lastOverride] = await transaction
    .select({
      cityCode: deliveryAddressOverrides.newCityCode,
      label: deliveryAddressOverrides.newLabel,
      number: deliveryAddressOverrides.newNumber,
      postalCode: deliveryAddressOverrides.newPostalCode,
    })
    .from(deliveryAddressOverrides)
    .where(
      and(
        eq(deliveryAddressOverrides.companyId, input.companyId),
        eq(deliveryAddressOverrides.tripDocumentId, input.tripDocumentId),
      ),
    )
    .orderBy(desc(deliveryAddressOverrides.createdAt))
    .limit(1)
  if (lastOverride !== undefined) {
    return {
      address: {
        cityCode: lastOverride.cityCode,
        number: lastOverride.number,
        postalCode: lastOverride.postalCode,
      },
      label: lastOverride.label,
    }
  }

  if (input.nfeDocumentId === null) {
    return { address: { cityCode: null, number: null, postalCode: null }, label: '' }
  }

  const [recipient] = await transaction
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      state: nfeAddresses.state,
      street: nfeAddresses.street,
    })
    .from(nfeParticipants)
    .innerJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, input.companyId),
        eq(nfeParticipants.documentId, input.nfeDocumentId),
        eq(nfeParticipants.role, 'recipient'),
      ),
    )
    .limit(1)
  if (recipient === undefined) {
    return { address: { cityCode: null, number: null, postalCode: null }, label: '' }
  }

  return {
    address: {
      cityCode: recipient.cityCode,
      number: recipient.number,
      postalCode: recipient.postalCode,
    },
    label: [recipient.street, recipient.city, recipient.state].filter(Boolean).join(', '),
  }
}
