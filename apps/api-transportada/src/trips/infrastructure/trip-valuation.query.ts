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
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
} from '../../database/freight-region.schema.js'
import { companyTaxSettings, tripCostEntries } from '../../database/trip-financial.schema.js'
import { resolveVehicleFreightClass } from '../../shared/vehicle-type.constant.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import { parseTollRouteCost } from '../../toll-booths/domain/toll-route-cost-snapshot.policy.js'
import type { FreightVehicleClass } from '../../shared/freight-class.constant.js'
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import type { TripCrewMember } from '../domain/trip-driver-cost.policy.js'
import {
  resolveTripDriverZone,
  type DriverZoneCoverage,
  type RegionCityEntry,
  type TripZoneStop,
} from '../domain/trip-driver-zone.policy.js'
import { listStopAddresses } from './nfe-destination-address.support.js'
import type { CompanyFederalRates } from '../domain/trip-tax.policy.js'
import { resolvePreviewStopKeys } from '../domain/cargo-preview.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { buildStopAddressKey } from '../domain/stop-address-key.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
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

  /**
   * A avaliação **antes de a viagem existir**: mesma conta, ancorada nas notas escolhidas e no
   * veículo do formulário em vez do `trip_id`. É o que responde "vale a pena montar isto?" no
   * momento em que a pergunta é feita — depois de criada, a decisão já foi tomada.
   *
   * ⚠️ Sem roteiro planejado não há distância, e sem distância não há combustível. A política já
   * trata isso: a parcela sai marcada como falta (`VALUATION_GAPS`), e a tela imprime a marca em vez
   * de um número inventado. Pedágio e taxa de entrega são zero pelo mesmo motivo — ninguém lançou
   * nada numa viagem que ainda não nasceu.
   */
  public async readPreviewContext(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }): Promise<TripValuationContext | null> {
    const [vehicle] = await this.database
      .select({
        axleCount: fleetVehicles.axleCount,
        fuelType: fleetVehicles.fuelType,
        /** Spec 095 D4: com tag, a parcela usa a tarifa automática — a mesma regra da montagem. */
        hasAutomaticTollPayment: fleetVehicles.hasAutomaticTollPayment,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
        vehicleType: fleetVehicles.vehicleType,
      })
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)
    if (vehicle === undefined) return null

    const [fuelPrice, documents, crew, federalRates] = await Promise.all([
      this.readFuelPrice({ companyId: input.companyId, product: toFuelProduct(vehicle.fuelType) }),
      this.readPreviewDocuments(input),
      this.readPreviewCrew(input),
      this.readFederalRates({ companyId: input.companyId }),
    ])

    return {
      crew,
      deliveryChargesTotal: null,
      distanceMeters: null,
      documents,
      federalRates,
      fuelPricePerLiter: fuelPrice,
      tollTotal: null,
      vehicle: {
        /** Spec 090 T9: mesma seleção do combustível — não paga uma segunda consulta pela ficha. */
        axles: resolveDeclaredVehicleAxles({
          axleCount: vehicle.axleCount,
          vehicleType: vehicle.vehicleType,
        }),
        hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
        kilometersPerLiter: vehicle.kilometersPerLiter,
        otherCostsPerKilometer: vehicle.otherCostsPerKilometer,
      },
    }
  }

  /**
   * Spec 090 D3: as coordenadas ordenadas da prévia, para o use case pedir a mesma geometria que o
   * mapa da montagem já pediu ao roteirizador.
   *
   * ⚠️ Agrupamento e ordem saem de `resolvePreviewStopKeys` — a mesma regra de
   * `buildCargoPreviewStops` — nunca um segundo critério: se divergissem, o mapa numeraria uma
   * parada e a distância seria calculada sobre outra.
   *
   * A coordenada é `geocoded_addresses`, a mesma tabela que `listTripStopCoordinates` lê depois de
   * a viagem existir — nota cujo endereço nunca foi geocodificado não entra na conta, como acontece
   * hoje com o roteiro já planejado.
   */
  public async readPreviewStopCoordinates(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly stopOrder: readonly string[]
  }): Promise<readonly RouteGeometryPoint[]> {
    if (input.nfeDocumentIds.length === 0) return []

    const addresses = await listStopAddresses(this.database, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    })

    const addressKeyByDocument = new Map<string, string | null>()
    for (const nfeDocumentId of input.nfeDocumentIds) {
      const address = addresses.get(nfeDocumentId)
      addressKeyByDocument.set(
        nfeDocumentId,
        address === undefined ? null : buildStopAddressKey(address.components),
      )
    }

    const orderedKeys = resolvePreviewStopKeys({
      addressKeyByDocument,
      nfeDocumentIds: input.nfeDocumentIds,
      order: input.stopOrder,
    })

    const rows = await this.database
      .select({
        addressKey: geocodedAddresses.addressKey,
        latitude: geocodedAddresses.latitude,
        longitude: geocodedAddresses.longitude,
      })
      .from(geocodedAddresses)
      .where(inArray(geocodedAddresses.addressKey, [...orderedKeys]))

    const rowByKey = new Map(rows.map((row) => [row.addressKey, row]))

    return orderedKeys.flatMap((key) => {
      const row = rowByKey.get(key)
      if (row === undefined) return []

      return [{ latitude: Number(row.latitude), longitude: Number(row.longitude) }]
    })
  }

  public async readContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripValuationContext | null> {
    const [trip] = await this.database
      .select({
        fuelType: fleetVehicles.fuelType,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
        plannedToll: trips.plannedToll,
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
      /**
       * Spec 090 T11: o congelado do momento do planejamento — nunca recalculado aqui (ver o
       * comentário em `TripValuationContext.toll`). `parseTollRouteCost` é a fronteira: forma
       * inesperada na coluna `jsonb` vira ausência, e a parcela volta ao lançamento manual.
       */
      toll: parseTollRouteCost(trip.plannedToll),
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

  /**
   * Spec 086: o catálogo de cidades com a zona a que cada uma pertence. Uma consulta por avaliação,
   * nunca uma por parada — a tabela do cliente tem 83 cidades, e ela cabe inteira em memória.
   */
  private async readZoneCatalog(companyId: string): Promise<readonly RegionCityEntry[]> {
    return this.database
      .select({
        city: freightRegionCities.city,
        code: freightRegions.code,
        regionId: freightRegions.id,
        state: freightRegionCities.state,
      })
      .from(freightRegionCities)
      .innerJoin(
        freightRegions,
        and(
          eq(freightRegions.companyId, freightRegionCities.companyId),
          eq(freightRegions.id, freightRegionCities.regionId),
        ),
      )
      .where(and(eq(freightRegionCities.companyId, companyId), eq(freightRegions.status, 'active')))
  }

  /** A cobertura de cada motorista, com o código impresso da zona — uma consulta para todos. */
  private async readDriverCoverage(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<Map<string, DriverZoneCoverage[]>> {
    const byDriver = new Map<string, DriverZoneCoverage[]>()
    if (input.driverIds.length === 0) return byDriver

    const rows = await this.database
      .select({
        city: fleetDriverRegions.city,
        code: freightRegions.code,
        driverId: fleetDriverRegions.driverId,
        regionId: freightRegions.id,
        scope: fleetDriverRegions.scope,
        state: fleetDriverRegions.state,
      })
      .from(fleetDriverRegions)
      .innerJoin(
        freightRegions,
        and(
          eq(freightRegions.companyId, fleetDriverRegions.companyId),
          eq(freightRegions.id, fleetDriverRegions.regionId),
        ),
      )
      .where(
        and(
          eq(fleetDriverRegions.companyId, input.companyId),
          inArray(fleetDriverRegions.driverId, [...input.driverIds]),
        ),
      )

    for (const row of rows) {
      const entries = byDriver.get(row.driverId) ?? []
      entries.push({
        city: row.city,
        code: row.code,
        regionId: row.regionId,
        scope: row.scope,
        state: row.state,
      })
      byDriver.set(row.driverId, entries)
    }

    return byDriver
  }

  /** O preço de cada zona para a classe do veículo. Classe vazia (cavalo mecânico) não tem coluna. */
  private async readRatesByRegion(input: {
    readonly companyId: string
    readonly freightClass: '' | FreightVehicleClass
    readonly regionIds: readonly string[]
  }): Promise<Map<string, string>> {
    const byRegion = new Map<string, string>()
    if (input.freightClass === '' || input.regionIds.length === 0) return byRegion

    const rows = await this.database
      .select({
        driverAmount: freightRegionDriverRates.driverAmount,
        regionId: freightRegionDriverRates.regionId,
      })
      .from(freightRegionDriverRates)
      .where(
        and(
          eq(freightRegionDriverRates.companyId, input.companyId),
          eq(freightRegionDriverRates.freightClass, input.freightClass),
          inArray(freightRegionDriverRates.regionId, [...input.regionIds]),
        ),
      )

    for (const row of rows) byRegion.set(row.regionId, row.driverAmount)

    return byRegion
  }

  /**
   * As paradas reduzidas ao que decide zona. O endereço é o **físico** (spec 073): a linha
   * divisória diz que quem decide *lugar* segue o desvio manual, depois `<entrega>`, depois o
   * destinatário — e a zona de frete é lugar.
   */
  private async readZoneStops(input: {
    readonly companyId: string
    readonly sequenceByDocument: ReadonlyMap<string, null | number>
  }): Promise<readonly TripZoneStop[]> {
    const nfeDocumentIds = [...input.sequenceByDocument.keys()]
    if (nfeDocumentIds.length === 0) return []

    const addresses = await listStopAddresses(this.database, {
      companyId: input.companyId,
      nfeDocumentIds,
    })

    return [...addresses.entries()].map(([documentId, address]) => ({
      city: address.city === '' ? null : address.city,
      sequence: input.sequenceByDocument.get(documentId) ?? null,
      state: address.state === '' ? null : address.state,
    }))
  }

  /**
   * Spec 086: **a zona que paga é a do destino, e a decisão não é da consulta.** Antes daqui, o
   * `leftJoin` trazia toda linha de cobertura do motorista e o código ficava com a primeira que
   * tivesse valor — o preço saía da ordem que o Postgres devolveu. Medido no dado real: em
   * BARRETOS, `truck` vale 1.086,12 na zona `1.000` e 1.508,51 na `1.003`.
   *
   * A consulta traz as candidatas; `resolveTripDriverZone` escolhe.
   */
  private async resolveCrew(input: {
    readonly companyId: string
    readonly drivers: readonly {
      readonly driverId: string
      readonly paymentModel: DriverPaymentModel
    }[]
    readonly freightClass: '' | FreightVehicleClass
    readonly stops: readonly TripZoneStop[]
  }): Promise<readonly TripCrewMember[]> {
    if (input.drivers.length === 0) return []

    const [catalog, coverage] = await Promise.all([
      this.readZoneCatalog(input.companyId),
      this.readDriverCoverage({
        companyId: input.companyId,
        driverIds: input.drivers.map((driver) => driver.driverId),
      }),
    ])

    const zones = input.drivers.map((driver) => ({
      driver,
      zone: resolveTripDriverZone({
        catalog,
        coverage: coverage.get(driver.driverId) ?? [],
        stops: input.stops,
      }),
    }))

    const rates = await this.readRatesByRegion({
      companyId: input.companyId,
      freightClass: input.freightClass,
      regionIds: zones.flatMap((entry) => ('regionId' in entry.zone ? [entry.zone.regionId] : [])),
    })

    return zones.map(({ driver, zone }) => {
      if (!('regionId' in zone)) {
        return {
          cityToRegister: 'cityToRegister' in zone ? zone.cityToRegister : null,
          driverId: driver.driverId,
          paymentModel: driver.paymentModel,
          routeAmount: null,
          routeGap: zone.gap,
        }
      }

      return {
        cityToRegister: null,
        driverId: driver.driverId,
        paymentModel: driver.paymentModel,
        routeAmount: rates.get(zone.regionId) ?? null,
        routeGap: null,
      }
    })
  }

  /** Espelha `readCrew`, mas parte dos ids do formulário — a viagem ainda não tem `trip_drivers`. */
  private async readPreviewCrew(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }): Promise<readonly TripCrewMember[]> {
    if (input.driverIds.length === 0) return []

    const [vehicle, drivers] = await Promise.all([
      this.readVehicleFreightClass({ companyId: input.companyId, vehicleId: input.vehicleId }),
      this.database
        .select({ driverId: fleetDrivers.id, paymentModel: fleetDrivers.paymentModel })
        .from(fleetDrivers)
        .where(
          and(
            eq(fleetDrivers.companyId, input.companyId),
            inArray(fleetDrivers.id, [...input.driverIds]),
          ),
        ),
    ])

    /**
     * ⚠️ Sem viagem não há `trip_stops`, então não há ordem — `sequence` é `null` e a política cai
     * na zona mais alta da família. É a leitura mais próxima de "o mais distante" quando o roteiro
     * ainda não foi calculado; famílias diferentes viram lacuna em vez de palpite.
     */
    const stops = await this.readZoneStops({
      companyId: input.companyId,
      sequenceByDocument: new Map(input.nfeDocumentIds.map((documentId) => [documentId, null])),
    })

    return this.resolveCrew({
      companyId: input.companyId,
      drivers,
      freightClass: vehicle,
      stops,
    })
  }

  /**
   * Espelha `readDocuments` partindo das notas escolhidas. `tripDocumentId` recebe o id da **nota**:
   * a linha da viagem ainda não existe, e o campo só serve de chave da linha na resposta.
   */
  private async readPreviewDocuments(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  }): Promise<readonly TripValuationDocument[]> {
    if (input.nfeDocumentIds.length === 0) return []

    const rows = await this.database
      .select({
        destinationCityCode: recipientAddress.cityCode,
        destinationState: recipientAddress.state,
        issuedAt: nfeDocuments.issuedAt,
        nfeDocumentId: nfeDocuments.id,
        nfeTotalAmount: nfeDocuments.totalValue,
        senderTaxId: emitterParticipant.taxId,
      })
      .from(nfeDocuments)
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
        and(
          eq(nfeDocuments.companyId, input.companyId),
          inArray(nfeDocuments.id, [...input.nfeDocumentIds]),
        ),
      )

    return rows.map((row) => ({
      destinationCityCode: row.destinationCityCode,
      destinationState: row.destinationState,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      /** Prévia não mede: o CT-e ainda não existe, então a receita é sempre a prevista. */
      measuredAmount: null,
      nfeDocumentId: row.nfeDocumentId,
      nfeTotalAmount: row.nfeTotalAmount,
      senderTaxId: row.senderTaxId,
      tripDocumentId: row.nfeDocumentId,
    }))
  }

  private async readCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripCrewMember[]> {
    const [vehicleRow] = await this.database
      .select({ vehicleType: fleetVehicles.vehicleType })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)

    const [drivers, sequenceByDocument] = await Promise.all([
      this.database
        .select({ driverId: fleetDrivers.id, paymentModel: fleetDrivers.paymentModel })
        .from(tripDrivers)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, tripDrivers.companyId),
            eq(fleetDrivers.id, tripDrivers.driverId),
          ),
        )
        .where(
          and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)),
        ),
      this.readTripStopSequences(input),
    ])

    const stops = await this.readZoneStops({
      companyId: input.companyId,
      sequenceByDocument,
    })

    return this.resolveCrew({
      companyId: input.companyId,
      drivers,
      freightClass: resolveVehicleFreightClass(vehicleRow?.vehicleType ?? ''),
      stops,
    })
  }

  /** A ordem das paradas por nota: é `sequence` que diz qual destino é o mais distante. */
  private async readTripStopSequences(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<ReadonlyMap<string, null | number>> {
    const rows = await this.database
      .select({ nfeDocumentId: tripDocuments.nfeDocumentId, sequence: tripStops.sequence })
      .from(tripDocuments)
      .leftJoin(
        tripStops,
        and(
          eq(tripStops.companyId, tripDocuments.companyId),
          eq(tripStops.id, tripDocuments.stopId),
        ),
      )
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
      )

    const byDocument = new Map<string, null | number>()
    for (const row of rows) {
      if (row.nfeDocumentId === null) continue
      byDocument.set(row.nfeDocumentId, row.sequence === null ? null : Number(row.sequence))
    }

    return byDocument
  }

  /** A classe da tabela de frete sai do tipo do veículo — cavalo mecânico manda `''` (spec 038). */
  private async readVehicleFreightClass(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<'' | FreightVehicleClass> {
    const [vehicle] = await this.database
      .select({ vehicleType: fleetVehicles.vehicleType })
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)

    return resolveVehicleFreightClass(vehicle?.vehicleType ?? '')
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
  /**
   * As notas de **várias** viagens numa consulta só, para a coluna de valores da listagem
   * (`readTripRevenueTotals`). Mesma junção de `readDocuments`, com o `trip_id` na projeção e sem o
   * ICMS: quem lista quer receita, e o imposto é do painel de resultado.
   */
  public async readDocumentsByTrip(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly TripValuationDocument[]>> {
    const byTrip = new Map<string, TripValuationDocument[]>()
    if (input.tripIds.length === 0) return byTrip

    const rows = await this.selectValuationDocuments(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.tripId, [...input.tripIds]),
      ),
    )

    for (const row of rows) {
      const current = byTrip.get(row.tripId)
      const document: TripValuationDocument = {
        destinationCityCode: row.destinationCityCode,
        destinationState: row.destinationState,
        issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
        measuredAmount: row.measuredAmount,
        nfeDocumentId: row.nfeDocumentId,
        nfeTotalAmount: row.nfeTotalAmount,
        senderTaxId: row.senderTaxId,
        tripDocumentId: row.tripDocumentId,
      }
      if (current === undefined) byTrip.set(row.tripId, [document])
      else current.push(document)
    }

    return byTrip
  }

  /**
   * A junção que responde "quanto esta nota vale e quanto ela já cobrou": nota (direta ou pelo
   * cálculo de frete), emitente, endereço do destinatário e o CT-e autorizado. Uma só, porque a
   * listagem e o painel precisam exatamente da mesma — e duas escreveriam duas verdades.
   */
  private selectValuationDocuments(where: ReturnType<typeof and>) {
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

    return this.database
      .select({
        destinationCityCode: recipientAddress.cityCode,
        tripId: tripDocuments.tripId,
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
      .where(where)
  }

  private async readDocuments(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripValuationDocument[]> {
    const rows = await this.selectValuationDocuments(
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
