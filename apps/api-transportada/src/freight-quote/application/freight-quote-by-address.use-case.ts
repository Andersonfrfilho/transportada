/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 342: cotação a partir dos endereços. Localiza os dois pontos, mede a estrada (distância e
 * pedágio por eixo, pelo mesmo roteirizador da viagem) e entrega ao cálculo de sempre
 * (`createCalculateFreightQuoteUseCase`) — nenhuma segunda conta de preço. Quem recusa aqui recusa
 * por dizer o motivo; nunca devolve um preço com parte estimada.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import type { VehicleType } from '../../shared/vehicle-type.constant.js'
import {
  freightQuoteAddressNotLocated,
  freightQuoteRouteUnavailable,
  freightQuoteTollUnknown,
} from '../domain/freight-quote.error.js'
import {
  isPreciseEnoughToQuote,
  isTollKnown,
  type QuoteTollReading,
} from '../domain/freight-quote-by-address.policy.js'
import type { FreightQuoteRequest, FreightQuoteResponse } from './freight-quote.use-case.js'

export type QuoteAddress = Readonly<{
  city: string
  cityIbgeCode: string | null
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type QuoteLocation = Readonly<{
  latitude: string
  longitude: string
  precision: GeocodingPrecision
}>

export type QuoteAddressLocatorPort = {
  /** `null` é "não achei" — resposta legítima, nunca erro. */
  locate(input: { readonly address: QuoteAddress }): Promise<null | QuoteLocation>
}

export type QuoteRoadReading = Readonly<{
  distanceMeters: number
  toll: null | QuoteTollReading
}>

export type QuoteRoadPort = {
  /** `null` é estrada indisponível (OSRM fora do ar, sem rota) — nunca uma reta. */
  read(input: {
    readonly axles: number
    readonly companyId: string
    readonly destination: QuoteLocation
    readonly origin: QuoteLocation
    readonly vehicleType: VehicleType
  }): Promise<null | QuoteRoadReading>
}

export type FreightQuoteByAddressRequest = Omit<FreightQuoteRequest, 'distanceKm' | 'tollAmount'> &
  Readonly<{
    destination: QuoteAddress
    origin: QuoteAddress
    vehicleType: VehicleType
  }>

export type FreightQuoteByAddressResponse = FreightQuoteResponse &
  Readonly<{ distanceKm: string; tollAmount: string }>

export function createCalculateFreightQuoteByAddressUseCase(dependencies: {
  readonly calculate: { execute(input: FreightQuoteRequest): Promise<FreightQuoteResponse> }
  readonly locator: QuoteAddressLocatorPort
  readonly road: QuoteRoadPort
}): {
  readonly execute: (input: FreightQuoteByAddressRequest) => Promise<FreightQuoteByAddressResponse>
} {
  return {
    execute: async (input) => {
      const [origin, destination] = await Promise.all([
        dependencies.locator.locate({ address: input.origin }),
        dependencies.locator.locate({ address: input.destination }),
      ])
      if (origin === null || !isPreciseEnoughToQuote(origin.precision))
        throw freightQuoteAddressNotLocated('origin')
      if (destination === null || !isPreciseEnoughToQuote(destination.precision))
        throw freightQuoteAddressNotLocated('destination')

      const road = await dependencies.road.read({
        axles: input.axles,
        companyId: input.companyId,
        destination,
        origin,
        vehicleType: input.vehicleType,
      })
      if (road === null || road.distanceMeters <= 0) throw freightQuoteRouteUnavailable()
      if (!isTollKnown(road.toll)) throw freightQuoteTollUnknown()

      const distanceKm = metersToKilometres(road.distanceMeters)
      const quote = await dependencies.calculate.execute({
        axles: input.axles,
        cargoType: input.cargoType,
        cargoValue: input.cargoValue,
        companyId: input.companyId,
        distanceKm,
        fuelPricePerLitre: input.fuelPricePerLitre,
        highPerformance: input.highPerformance,
        shareOfVehiclePercent: input.shareOfVehiclePercent,
        tollAmount: road.toll.total,
      })
      return { ...quote, distanceKm, tollAmount: road.toll.total }
    },
  }
}

/** Metros inteiros → quilômetros com 3 casas, por aritmética inteira (sem ponto flutuante). */
export function metersToKilometres(meters: number): string {
  const whole = Math.round(meters)
  const km = Math.trunc(whole / 1000)
  const rest = String(whole % 1000).padStart(3, '0')
  return `${km}.${rest}`
}
