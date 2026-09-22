/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { aliasedTable, and, asc, eq, inArray, sql, sum } from 'drizzle-orm'

import type { FuelProduct } from '../../shared/fuel.constant.js'
import { readEffectiveFuelPrice, toFuelProduct } from './effective-fuel-price.query.js'
import { cteBatchItemCharges, cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuancePayloads } from '../../database/cte-issuance.schema.js'
import {
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  type CteEmissionMatchRole,
} from '../../database/cte-emission-profile.schema.js'
import type { IcmsEmissionProfile } from '../domain/trip-icms-projection.policy.js'
import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { companyDriverAllowanceSettings } from '../../database/company-driver-allowance-settings.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { companyTaxSettings, tripCostEntries } from '../../database/trip-financial.schema.js'
import { resolveDeclaredTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import { parseTollRouteCost } from '../../toll-booths/domain/toll-route-cost-snapshot.policy.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { orderCrewByRequest } from '../domain/trip-crew-order.policy.js'
import type { TripCrewMember } from '../domain/trip-driver-cost.policy.js'
import { listStopAddresses } from './nfe-destination-address.support.js'
import type { CompanyFederalRates } from '../domain/trip-tax.policy.js'
import { resolvePreviewStopKeys } from '../domain/cargo-preview.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { buildStopAddressKey } from '../domain/stop-address-key.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  TripValuationContext,
  TripValuationDocument,
} from '../application/read-trip-valuation.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const recipientParticipant = aliasedTable(nfeParticipants, 'valuation_recipient_participant')
const recipientAddress = aliasedTable(nfeAddresses, 'valuation_recipient_address')
const emitterParticipant = aliasedTable(nfeParticipants, 'valuation_emitter_participant')

/**
 * O id de motorista que a prévia pediu e o banco não respondeu. Id opaco, nunca o nome: o aviso
 * serve para rastrear a diferença de margem, não para publicar quem dirige.
 */
const PREVIEW_CREW_DRIVER_NOT_FOUND = 'trip.valuation.preview_crew_driver_not_found'

export class DrizzleTripValuationQuery {
  public constructor(
    private readonly database: Database,
    private readonly logger: ApiLogger,
  ) {}

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

    const [fuelPrice, documents, crew, federalRates, profiles, companyDailyAllowanceAmount] =
      await Promise.all([
        this.readFuelPrice({
          companyId: input.companyId,
          product: toFuelProduct(vehicle.fuelType),
        }),
        this.readPreviewDocuments(input),
        this.readPreviewCrew(input),
        this.readFederalRates({ companyId: input.companyId }),
        this.readIcmsProfiles(input.companyId),
        this.readCompanyDailyAllowanceAmount(input.companyId),
      ])

    return {
      companyDailyAllowanceAmount,
      crew,
      deliveryChargesTotal: null,
      distanceMeters: null,
      documents,
      /** Spec 125: sem CT-e na prévia, o ICMS de toda nota é a projeção pelo perfil. */
      emissionProfiles: profiles,
      federalRates,
      fuelPricePerLiter: fuelPrice,
      tollTotal: null,
      vehicle: {
        /** Spec 090 T9: mesma seleção do combustível — não paga uma segunda consulta pela ficha. */
        axles: resolveDeclaredVehicleAxles({
          axleCount: vehicle.axleCount,
          vehicleType: vehicle.vehicleType,
        }),
        /** A categoria sai da mesma ficha que os eixos: as duas descrevem o mesmo veículo. */
        multiplier: resolveDeclaredTollMultiplier({
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
        dailyAllowanceDays: trips.dailyAllowanceDays,
        fuelType: fleetVehicles.fuelType,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        otherCostsPerKilometer: fleetVehicles.otherCostsPerKilometer,
        plannedDistanceMeters: trips.plannedDistanceMeters,
        /** Spec 143 D4 sobre a 153 RF5: os segundos crus vêm congelados com a distância, nunca somados das paradas. */
        plannedDurationSeconds: trips.plannedDurationSeconds,
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

    const [
      fuelPrice,
      documents,
      crew,
      tollTotal,
      manualCostTotal,
      deliveryChargesTotal,
      federalRates,
      profiles,
      companyDailyAllowanceAmount,
    ] = await Promise.all([
      this.readFuelPrice({ companyId: input.companyId, product: toFuelProduct(trip.fuelType) }),
      this.readDocuments(input),
      this.readCrew(input),
      this.readTollTotal(input),
      this.readManualCostTotal(input),
      this.readDeliveryChargesTotal(input),
      this.readFederalRates({ companyId: input.companyId }),
      this.readIcmsProfiles(input.companyId),
      this.readCompanyDailyAllowanceAmount(input.companyId),
    ])

    return {
      companyDailyAllowanceAmount,
      crew,
      dailyAllowanceDays: trip.dailyAllowanceDays,
      deliveryChargesTotal,
      distanceMeters: trip.plannedDistanceMeters,
      documents,
      /** Spec 125: nota com CT-e usa o documento; as outras, a projeção pelo perfil. */
      emissionProfiles: profiles,
      estimatedDurationSeconds: trip.plannedDurationSeconds,
      federalRates,
      fuelPricePerLiter: fuelPrice,
      manualCostTotal,
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
   * Spec 143 D3: o valor geral da empresa, **uma leitura por contexto** — nunca replicada por
   * linha de tripulação, o que tornaria representável "dois valores gerais para a mesma empresa".
   * Ausência de linha é "não configurada", e a política aplica a constante do sistema.
   */
  private async readCompanyDailyAllowanceAmount(companyId: string): Promise<null | string> {
    const [row] = await this.database
      .select({ dailyAllowanceAmount: companyDriverAllowanceSettings.dailyAllowanceAmount })
      .from(companyDriverAllowanceSettings)
      .where(eq(companyDriverAllowanceSettings.companyId, companyId))
      .limit(1)

    return row?.dailyAllowanceAmount ?? null
  }

  /**
   * Espelha `readCrew`, mas parte dos ids do formulário — a viagem ainda não tem `trip_drivers`.
   * Spec 143 D1: `driverAmount` cru de `fleet_drivers.daily_allowance_amount`; a política decide
   * se o motorista, a empresa ou o padrão paga.
   */
  private async readPreviewCrew(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly TripCrewMember[]> {
    if (input.driverIds.length === 0) return []

    const rows = await this.database
      .select({
        driverAmount: fleetDrivers.dailyAllowanceAmount,
        driverId: fleetDrivers.id,
        driverName: fleetDrivers.name,
        paymentModel: fleetDrivers.paymentModel,
      })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          inArray(fleetDrivers.id, [...input.driverIds]),
        ),
      )

    const ordered = orderCrewByRequest({ crew: rows, driverIds: input.driverIds })

    /**
     * ⚠️ O filtro por empresa descartando um id é a defesa de tenant funcionando — e é justamente
     * por isso que o descarte precisa aparecer: a prévia devolve margem maior com um motorista a
     * menos, e sem este aviso o sumiço não deixa rastro em lugar nenhum.
     */
    if (ordered.missingDriverIds.length > 0) {
      this.logger.warn(PREVIEW_CREW_DRIVER_NOT_FOUND, {
        companyId: input.companyId,
        driverIds: ordered.missingDriverIds,
      })
    }

    return ordered.crew
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
        recipientTaxId: recipientParticipant.taxId,
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
      recipientTaxId: row.recipientTaxId,
      senderTaxId: row.senderTaxId,
      tripDocumentId: row.nfeDocumentId,
    }))
  }

  /**
   * Spec 143 D1: um único JOIN `trip_drivers ⋈ fleet_drivers` — `driverAmount` cru, sem resolução
   * de zona nem de cobertura. A política (`buildTripDriverCost`) decide se paga o motorista, a
   * empresa ou o padrão; a consulta só entrega o que o banco sabe.
   */
  private async readCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripCrewMember[]> {
    return (
      this.database
        .select({
          driverAmount: fleetDrivers.dailyAllowanceAmount,
          driverId: fleetDrivers.id,
          driverName: fleetDrivers.name,
          paymentModel: fleetDrivers.paymentModel,
        })
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
        )
        /** `position` é a ordem que a viagem gravou; sem ela o `SELECT` devolve o que quiser. */
        .orderBy(asc(tripDrivers.position))
    )
  }

  /** `null` quando ninguém lançou pedágio — ausência de lançamento, não gratuidade. */
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
          eq(tripCostEntries.kind, 'toll'),
        ),
      )

    return row?.total ?? null
  }

  /**
   * Spec 143 D6: o avulso (`kind = 'other'`) alimenta a parcela `manual`, nunca a `toll` — antes
   * desta consulta existir, `readTollTotal` somava os dois lançamentos juntos. `null` quando
   * ninguém lançou nada — ausência de lançamento, não gratuidade.
   */
  private async readManualCostTotal(input: {
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
          eq(tripCostEntries.kind, 'other'),
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

  /**
   * Spec 125: os perfis **ativos** de emissão com os matchers e o que decide o ICMS — uma consulta
   * por conta. Perfil é configuração (poucas linhas por empresa), e a escolha por nota acontece em
   * memória por `findEmissionProfile`, a mesma que a listagem de notas usa.
   */
  private async readIcmsProfiles(companyId: string): Promise<readonly IcmsEmissionProfile[]> {
    const rows = await this.database
      .select({ matcher: cteEmissionProfileMatchers, profile: cteEmissionProfiles })
      .from(cteEmissionProfiles)
      .leftJoin(
        cteEmissionProfileMatchers,
        and(
          eq(cteEmissionProfileMatchers.companyId, cteEmissionProfiles.companyId),
          eq(cteEmissionProfileMatchers.profileId, cteEmissionProfiles.id),
        ),
      )
      .where(
        and(eq(cteEmissionProfiles.companyId, companyId), eq(cteEmissionProfiles.status, 'active')),
      )

    const profileById = new Map<string, (typeof rows)[number]['profile']>()
    const matchersByProfile = new Map<
      string,
      { matchRole: CteEmissionMatchRole; taxId: string }[]
    >()
    for (const row of rows) {
      profileById.set(row.profile.id, row.profile)
      if (row.matcher === null) continue
      const matchers = matchersByProfile.get(row.profile.id) ?? []
      matchers.push({ matchRole: row.matcher.matchRole, taxId: row.matcher.taxId })
      matchersByProfile.set(row.profile.id, matchers)
    }

    return [...profileById.values()].map((profile) => ({
      icmsBaseReductionRate: profile.icmsBaseReductionRate,
      icmsCst: profile.icmsCst,
      icmsRate: profile.icmsRate,
      id: profile.id,
      matchMode: profile.matchMode,
      matchers: matchersByProfile.get(profile.id) ?? [],
      name: profile.name,
      priority: profile.priority,
      status: profile.status,
    }))
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

  private readFuelPrice(input: {
    readonly companyId: string
    readonly product: FuelProduct | null
  }): Promise<null | string> {
    return readEffectiveFuelPrice(this.database, input)
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
        recipientTaxId: recipientParticipant.taxId,
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
      recipientTaxId: row.recipientTaxId,
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
