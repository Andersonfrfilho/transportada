/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { aliasedTable, and, eq, sql, sum } from 'drizzle-orm'

import { companyFuelPrices } from '../../database/company-fuel-prices.schema.js'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant.js'
import { cteBatchItemCharges, cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import type {
  TripValuationContext,
  TripValuationDocument,
} from '../application/read-trip-valuation.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const recipientParticipant = aliasedTable(nfeParticipants, 'valuation_recipient_participant')
const recipientAddress = aliasedTable(nfeAddresses, 'valuation_recipient_address')
const emitterParticipant = aliasedTable(nfeParticipants, 'valuation_emitter_participant')

export class DrizzleTripValuationQuery {
  public constructor(private readonly database: Database) {}

  public async readContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripValuationContext | null> {
    const [trip] = await this.database
      .select({
        fuelType: fleetVehicles.fuelType,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
      })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (trip === undefined) return null

    const [distance, fuelPrice, documents] = await Promise.all([
      this.readPlannedDistance(input),
      this.readFuelPrice({ companyId: input.companyId, product: toFuelProduct(trip.fuelType) }),
      this.readDocuments(input),
    ])

    return {
      distanceMeters: distance,
      documents,
      fuelPricePerLiter: fuelPrice,
      vehicle: {
        kilometersPerLiter: trip.kilometersPerLiter,
        otherCostsPerKilometer: trip.otherCostsPerKilometer,
      },
    }
  }

  /**
   * A distância é a do roteiro aceito, somada pelas paradas. `null` — e não zero — quando nenhuma
   * parada tem trecho calculado: zero faria o combustível parecer grátis.
   */
  private async readPlannedDistance(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | number> {
    const [row] = await this.database
      .select({ meters: sum(tripStops.distanceFromPreviousMeters) })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

    const meters = row?.meters ?? null
    return meters === null ? null : Number(meters)
  }

  private async readFuelPrice(input: {
    readonly companyId: string
    readonly product: FuelProduct | null
  }): Promise<null | string> {
    if (input.product === null) return null
    const [row] = await this.database
      .select({ pricePerUnit: companyFuelPrices.pricePerUnit })
      .from(companyFuelPrices)
      .where(
        and(
          eq(companyFuelPrices.companyId, input.companyId),
          eq(companyFuelPrices.product, input.product),
        ),
      )
      .limit(1)

    return row?.pricePerUnit ?? null
  }

  /**
   * Uma consulta para as N notas, pelos **dois** caminhos de vínculo que `trip_documents` permite —
   * a NF-e direta e o cálculo de frete. O valor medido é a soma dos encargos do item de lote cujo
   * CT-e está **autorizado**: item sem autorização não é receita, é intenção.
   */
  private async readDocuments(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripValuationDocument[]> {
    const measuredAmount = this.database
      .select({ total: sum(cteBatchItemCharges.amount).as('measured_amount') })
      .from(cteBatchItems)
      .innerJoin(
        cteBatchItemCharges,
        and(
          eq(cteBatchItemCharges.companyId, cteBatchItems.companyId),
          eq(cteBatchItemCharges.itemId, cteBatchItems.id),
        ),
      )
      .innerJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
          eq(cteFiscalDocuments.status, 'authorized'),
        ),
      )
      .where(
        and(
          eq(cteBatchItems.companyId, nfeDocuments.companyId),
          eq(cteBatchItems.nfeDocumentId, nfeDocuments.id),
        ),
      )

    const rows = await this.database
      .select({
        destinationCityCode: recipientAddress.cityCode,
        destinationState: recipientAddress.state,
        issuedAt: nfeDocuments.issuedAt,
        measuredAmount: sql<null | string>`(${measuredAmount})`.as('measured_amount'),
        nfeDocumentId: nfeDocuments.id,
        nfeTotalAmount: nfeDocuments.totalValue,
        senderTaxId: emitterParticipant.taxId,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripDocuments)
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, tripDocuments.companyId),
          eq(
            nfeDocuments.id,
            sql`coalesce(${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`,
          ),
        ),
      )
      .leftJoin(
        emitterParticipant,
        and(
          eq(emitterParticipant.companyId, nfeDocuments.companyId),
          eq(emitterParticipant.documentId, nfeDocuments.id),
          eq(emitterParticipant.role, 'emitter'),
        ),
      )
      .leftJoin(
        recipientParticipant,
        and(
          eq(recipientParticipant.companyId, nfeDocuments.companyId),
          eq(recipientParticipant.documentId, nfeDocuments.id),
          eq(recipientParticipant.role, 'recipient'),
        ),
      )
      .leftJoin(
        recipientAddress,
        and(
          eq(recipientAddress.companyId, recipientParticipant.companyId),
          eq(recipientAddress.participantId, recipientParticipant.id),
        ),
      )
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
      )

    return rows.map((row) => ({
      destinationCityCode: row.destinationCityCode,
      destinationState: row.destinationState,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      measuredAmount: row.measuredAmount,
      nfeDocumentId: row.nfeDocumentId,
      nfeTotalAmount: row.nfeTotalAmount,
      senderTaxId: row.senderTaxId,
      tripDocumentId: row.tripDocumentId,
    }))
  }
}

/** O cadastro guarda o combustível como texto livre do catálogo; fora dele não há preço a buscar. */
function toFuelProduct(value: null | string): FuelProduct | null {
  return FUEL_PRODUCTS.includes(value as FuelProduct) ? (value as FuelProduct) : null
}
