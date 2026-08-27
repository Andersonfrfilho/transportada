/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { aliasedTable, and, eq, inArray, sql, sum } from 'drizzle-orm'

import { companyFuelPrices } from '../../database/company-fuel-prices.schema.js'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant.js'
import { cteBatchItemCharges, cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuancePayloads } from '../../database/cte-issuance.schema.js'
import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import {
  fleetDriverRegions,
  freightRegionDriverRates,
} from '../../database/freight-region.schema.js'
import { companyTaxSettings, tripCostEntries } from '../../database/trip-financial.schema.js'
import { resolveVehicleFreightClass } from '../../shared/vehicle-type.constant.js'
import type { TripCrewMember } from '../domain/trip-driver-cost.policy.js'
import type { CompanyFederalRates } from '../domain/trip-tax.policy.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
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

    const [distance, fuelPrice, documents, crew, tollTotal, deliveryChargesTotal, federalRates] =
      await Promise.all([
        this.readPlannedDistance(input),
        this.readFuelPrice({ companyId: input.companyId, product: toFuelProduct(trip.fuelType) }),
        this.readDocuments(input),
        this.readCrew(input),
        this.readTollTotal(input),
        this.readDeliveryChargesTotal(input),
        this.readFederalRates({ companyId: input.companyId }),
      ])

    return {
      crew,
      deliveryChargesTotal,
      distanceMeters: distance,
      documents,
      federalRates,
      fuelPricePerLiter: fuelPrice,
      tollTotal,
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

  /**
   * ADR-0049 §3: quem dirige e como é pago. O valor da rota sai da tabela de região cruzando **a
   * zona da parada** com a classe do veículo — e a classe existe desde a spec 038.
   *
   * `routeAmount` fica `null` quando a tabela não cobre aquela zona ou aquela classe: é
   * desconhecido, e o cálculo trata desconhecido como desconhecido.
   */
  private async readCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripCrewMember[]> {
    const [vehicle] = await this.database
      .select({ vehicleType: fleetVehicles.vehicleType })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    const freightClass = resolveVehicleFreightClass(vehicle?.vehicleType ?? '')

    const rows = await this.database
      .select({
        driverId: fleetDrivers.id,
        paymentModel: fleetDrivers.paymentModel,
        routeAmount: freightRegionDriverRates.driverAmount,
      })
      .from(tripDrivers)
      .innerJoin(
        fleetDrivers,
        and(
          eq(fleetDrivers.companyId, tripDrivers.companyId),
          eq(fleetDrivers.id, tripDrivers.driverId),
        ),
      )
      .leftJoin(
        fleetDriverRegions,
        and(
          eq(fleetDriverRegions.companyId, fleetDrivers.companyId),
          eq(fleetDriverRegions.driverId, fleetDrivers.id),
        ),
      )
      .leftJoin(
        freightRegionDriverRates,
        and(
          eq(freightRegionDriverRates.companyId, fleetDriverRegions.companyId),
          eq(freightRegionDriverRates.regionId, fleetDriverRegions.regionId),
          freightClass === ''
            ? sql`false`
            : eq(freightRegionDriverRates.freightClass, freightClass),
        ),
      )
      .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))

    /** Um condutor pode cobrir várias zonas: a linha dele é uma só, com o primeiro valor que casar. */
    const byDriver = new Map<string, TripCrewMember>()
    for (const row of rows) {
      const current = byDriver.get(row.driverId)
      if (current === undefined || (current.routeAmount === null && row.routeAmount !== null)) {
        byDriver.set(row.driverId, {
          driverId: row.driverId,
          paymentModel: row.paymentModel,
          routeAmount: row.routeAmount,
        })
      }
    }

    return [...byDriver.values()]
  }

  /** Pedágio e avulsos. `null` quando ninguém lançou nada — ausência de lançamento, não gratuidade. */
  private async readTollTotal(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | string> {
    const [row] = await this.database
      .select({ total: sum(tripCostEntries.amount) })
      .from(tripCostEntries)
      .where(
        and(
          eq(tripCostEntries.companyId, input.companyId),
          eq(tripCostEntries.tripId, input.tripId),
        ),
      )

    return row?.total ?? null
  }

  /**
   * As taxas da 060 que já passaram por gente. Sugestão não confirmada fica de fora: ela ainda não é
   * fato, e somá-la faria a viagem parecer mais cara do que se sabe.
   */
  private async readDeliveryChargesTotal(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | string> {
    const [row] = await this.database
      .select({ total: sum(deliveryCharges.amount) })
      .from(deliveryCharges)
      .where(
        and(
          eq(deliveryCharges.companyId, input.companyId),
          eq(deliveryCharges.tripId, input.tripId),
          inArray(deliveryCharges.status, ['recorded', 'submitted', 'approved', 'reimbursed']),
        ),
      )

    return row?.total ?? null
  }

  /** `null` quando a empresa não declarou regime: PIS/COFINS fica `missing` (ADR-0049 §4). */
  private async readFederalRates(input: {
    readonly companyId: string
  }): Promise<CompanyFederalRates | null> {
    const [row] = await this.database
      .select({ cofinsRate: companyTaxSettings.cofinsRate, pisRate: companyTaxSettings.pisRate })
      .from(companyTaxSettings)
      .where(eq(companyTaxSettings.companyId, input.companyId))
      .limit(1)

    return row ?? null
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

    const icmsByDocument = await this.readIcmsByDocument({
      companyId: input.companyId,
      nfeDocumentIds: rows
        .map((row) => row.nfeDocumentId)
        .filter((documentId): documentId is string => documentId !== null),
    })

    return rows.map((row) => ({
      destinationCityCode: row.destinationCityCode,
      destinationState: row.destinationState,
      icmsAmount: icmsByDocument.get(row.nfeDocumentId ?? '') ?? null,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      measuredAmount: row.measuredAmount,
      nfeDocumentId: row.nfeDocumentId,
      nfeTotalAmount: row.nfeTotalAmount,
      senderTaxId: row.senderTaxId,
      tripDocumentId: row.tripDocumentId,
    }))
  }

  /**
   * ADR-0049 §4: o ICMS **do documento**, lido do payload congelado — foi ele que viajou no XML, e
   * recalculá-lo do perfil de hoje discordaria da SEFAZ no dia em que a alíquota mudasse.
   *
   * Consulta própria, e não subconsulta correlacionada: são N notas numa consulta só, e o mapa é
   * montado aqui — o mesmo padrão dos volumes e do manifesto na viagem do motorista.
   *
   * CST isento não escreve `vICMS`, e isento é zero **medido**: o `coalesce` traduz isso. Nota sem
   * documento autorizado simplesmente não entra no mapa, e aí o valor é `null` — desconhecido.
   */
  private async readIcmsByDocument(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  }): Promise<Map<string, string>> {
    if (input.nfeDocumentIds.length === 0) return new Map()

    const rows = await this.database
      .select({
        amount: sql<string>`coalesce((${cteIssuancePayloads.payload} -> 'icms' ->> 'vICMS')::numeric, 0)::text`,
        nfeDocumentId: cteBatchItems.nfeDocumentId,
      })
      .from(cteBatchItems)
      .innerJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
          eq(cteFiscalDocuments.status, 'authorized'),
        ),
      )
      .innerJoin(
        cteIssuancePayloads,
        and(
          eq(cteIssuancePayloads.companyId, cteFiscalDocuments.companyId),
          eq(cteIssuancePayloads.attemptId, cteFiscalDocuments.attemptId),
        ),
      )
      .where(
        and(
          eq(cteBatchItems.companyId, input.companyId),
          inArray(cteBatchItems.nfeDocumentId, [...input.nfeDocumentIds]),
        ),
      )

    return new Map(rows.map((row) => [row.nfeDocumentId, row.amount]))
  }
}

/** O cadastro guarda o combustível como texto livre do catálogo; fora dele não há preço a buscar. */
function toFuelProduct(value: null | string): FuelProduct | null {
  return FUEL_PRODUCTS.includes(value as FuelProduct) ? (value as FuelProduct) : null
}
