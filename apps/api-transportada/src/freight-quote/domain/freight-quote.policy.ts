/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Orçamento de frete pelo custo da viagem:
 *
 *   custoViagem = km × (combustível/km + motorista + manutenção + pneus + fixo/km) + pedágio
 *   custoDoEmbarque = custoViagem × min(1, parteDoVeículo ÷ ocupaçãoEsperada)
 *   frete = custoDoEmbarque ÷ (1 − margem)
 *   se o piso da ANTT for maior, o frete é o piso
 *   total = frete + frete-valor (ad valorem) + GRIS
 *
 * Tudo em bigint com seis casas, arredondamento meio para cima — nunca float binário. O piso da ANTT
 * compara com o **frete** (o serviço de transporte); frete-valor e GRIS são adicionais por risco e
 * entram depois, por cima.
 */
import {
  findAnttFloorCoefficients,
  type AnttCargoTypeCode,
  type AnttFloorTable,
} from './antt-floor.constant.js'
import { REFERENCE_FUEL_KM_PER_LITER } from './freight-quote-defaults.constant.js'

const SCALE = 1_000_000n
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/
const OUTPUT_DIVISOR = 100n

export type FreightQuoteSettingsValues = {
  readonly adValoremPercent: string
  readonly applyAnttFloor: boolean
  readonly driverCostPerKm: string
  readonly expectedOccupancyPercent: string
  readonly fixedCostPerKm: string
  readonly fuelKmPerLiter: string | null
  readonly grisPercent: string
  readonly maintenanceCostPerKm: string
  readonly marginPercent: string
  readonly tiresCostPerKm: string
}

export type FreightQuoteInput = {
  readonly axles: number
  readonly cargoType: AnttCargoTypeCode
  readonly cargoValue: string
  readonly distanceKm: string
  readonly fuelPricePerLitre: string
  readonly highPerformance: boolean
  readonly settings: FreightQuoteSettingsValues
  readonly shareOfVehiclePercent: string
  readonly tollAmount: string
}

export type FreightQuoteAnttFloor = {
  readonly applied: boolean
  readonly axlesUsed: number
  readonly cc: string
  readonly ccd: string
  readonly floorAmount: string
  readonly table: AnttFloorTable
}

export type FreightQuoteResult = {
  readonly adValoremAmount: string
  readonly anttFloor: FreightQuoteAnttFloor | null
  readonly costShareFactor: string
  readonly fuelKmPerLiter: string
  readonly fuelKmPerLiterOrigin: 'company' | 'reference'
  readonly freightAmount: string
  readonly grisAmount: string
  readonly lines: readonly { readonly amount: string; readonly key: string }[]
  readonly marginAmount: string
  readonly shipmentCostAmount: string
  readonly totalAmount: string
  readonly tripCostAmount: string
}

export class FreightQuoteInputError extends Error {
  public constructor(public readonly code: string) {
    super(code)
    this.name = 'FreightQuoteInputError'
  }
}

export function calculateFreightQuote(input: FreightQuoteInput): FreightQuoteResult {
  const distance = positive(input.distanceKm, 'FREIGHT_QUOTE_DISTANCE_INVALID')
  const fuelPrice = positive(input.fuelPricePerLitre, 'FREIGHT_QUOTE_FUEL_PRICE_INVALID')
  const share = positive(input.shareOfVehiclePercent, 'FREIGHT_QUOTE_SHARE_INVALID')
  if (share > 100n * SCALE) throw new FreightQuoteInputError('FREIGHT_QUOTE_SHARE_INVALID')
  const occupancy = positive(
    input.settings.expectedOccupancyPercent,
    'FREIGHT_QUOTE_OCCUPANCY_INVALID',
  )
  if (occupancy > 100n * SCALE) throw new FreightQuoteInputError('FREIGHT_QUOTE_OCCUPANCY_INVALID')
  const margin = parse(input.settings.marginPercent, 'FREIGHT_QUOTE_MARGIN_INVALID')
  if (margin >= 100n * SCALE) throw new FreightQuoteInputError('FREIGHT_QUOTE_MARGIN_INVALID')

  const companyConsumption = input.settings.fuelKmPerLiter
  const kmPerLiterText =
    companyConsumption ?? REFERENCE_FUEL_KM_PER_LITER[input.axles] ?? REFERENCE_FUEL_KM_PER_LITER[3]
  const kmPerLiter = positive(kmPerLiterText ?? '', 'FREIGHT_QUOTE_CONSUMPTION_INVALID')

  const fuelPerKm = divide(fuelPrice, kmPerLiter)
  const perKm =
    fuelPerKm +
    parse(input.settings.driverCostPerKm, 'FREIGHT_QUOTE_COST_INVALID') +
    parse(input.settings.maintenanceCostPerKm, 'FREIGHT_QUOTE_COST_INVALID') +
    parse(input.settings.tiresCostPerKm, 'FREIGHT_QUOTE_COST_INVALID') +
    parse(input.settings.fixedCostPerKm, 'FREIGHT_QUOTE_COST_INVALID')
  const toll = parse(input.tollAmount, 'FREIGHT_QUOTE_TOLL_INVALID')
  const tripCost = multiply(distance, perKm) + toll

  const rawShare = divide(share, occupancy)
  const costShare = rawShare > SCALE ? SCALE : rawShare
  const shipmentCost = multiply(tripCost, costShare)

  const marginFactor = SCALE - percentToFactor(margin)
  const sellingPrice = divide(shipmentCost, marginFactor)
  const marginAmount = sellingPrice - shipmentCost

  const floor = resolveFloor(input, distance)
  const floorApplies =
    input.settings.applyAnttFloor && floor !== null && floor.amount > sellingPrice
  const freight = floorApplies && floor !== null ? floor.amount : sellingPrice

  const cargoValue = parse(input.cargoValue, 'FREIGHT_QUOTE_CARGO_VALUE_INVALID')
  const adValorem = multiply(
    cargoValue,
    percentToFactor(parse(input.settings.adValoremPercent, 'FREIGHT_QUOTE_RATE_INVALID')),
  )
  const gris = multiply(
    cargoValue,
    percentToFactor(parse(input.settings.grisPercent, 'FREIGHT_QUOTE_RATE_INVALID')),
  )
  const total = freight + adValorem + gris

  return {
    adValoremAmount: money(adValorem),
    anttFloor:
      floor === null
        ? null
        : {
            applied: floorApplies,
            axlesUsed: floor.axlesUsed,
            cc: floor.cc,
            ccd: floor.ccd,
            floorAmount: money(floor.amount),
            table: floor.table,
          },
    costShareFactor: ratio(costShare),
    freightAmount: money(freight),
    fuelKmPerLiter: ratio(kmPerLiter),
    fuelKmPerLiterOrigin: companyConsumption === null ? 'reference' : 'company',
    grisAmount: money(gris),
    lines: [
      { amount: money(multiply(distance, fuelPerKm)), key: 'fuel' },
      {
        amount: money(
          multiply(distance, parse(input.settings.driverCostPerKm, 'FREIGHT_QUOTE_COST_INVALID')),
        ),
        key: 'driver',
      },
      {
        amount: money(
          multiply(
            distance,
            parse(input.settings.maintenanceCostPerKm, 'FREIGHT_QUOTE_COST_INVALID') +
              parse(input.settings.tiresCostPerKm, 'FREIGHT_QUOTE_COST_INVALID'),
          ),
        ),
        key: 'maintenanceAndTires',
      },
      {
        amount: money(
          multiply(distance, parse(input.settings.fixedCostPerKm, 'FREIGHT_QUOTE_COST_INVALID')),
        ),
        key: 'fixed',
      },
      { amount: money(toll), key: 'toll' },
    ],
    marginAmount: money(marginAmount),
    shipmentCostAmount: money(shipmentCost),
    totalAmount: money(total),
    tripCostAmount: money(tripCost),
  }
}

function resolveFloor(
  input: FreightQuoteInput,
  distance: bigint,
): {
  readonly amount: bigint
  readonly axlesUsed: number
  readonly cc: string
  readonly ccd: string
  readonly table: AnttFloorTable
} | null {
  const table: AnttFloorTable = input.highPerformance ? 'C' : 'A'
  const coefficients = findAnttFloorCoefficients({
    axles: input.axles,
    cargoType: input.cargoType,
    table,
  })
  if (coefficients === null) return null
  const amount =
    multiply(distance, parse(coefficients.ccd, 'FREIGHT_QUOTE_COST_INVALID')) +
    parse(coefficients.cc, 'FREIGHT_QUOTE_COST_INVALID')
  return {
    amount,
    axlesUsed: coefficients.axlesUsed,
    cc: coefficients.cc,
    ccd: coefficients.ccd,
    table,
  }
}

function parse(value: string, code: string): bigint {
  const match = DECIMAL_PATTERN.exec(value)
  if (match === null) throw new FreightQuoteInputError(code)
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'))
}

function positive(value: string, code: string): bigint {
  const parsed = parse(value, code)
  if (parsed <= 0n) throw new FreightQuoteInputError(code)
  return parsed
}

function multiply(left: bigint, right: bigint): bigint {
  return (left * right + SCALE / 2n) / SCALE
}

function divide(left: bigint, right: bigint): bigint {
  return (left * SCALE + right / 2n) / right
}

/** Percentual (`15` = 15%) para fator (`0,15`). */
function percentToFactor(percent: bigint): bigint {
  return (percent + OUTPUT_DIVISOR / 2n) / OUTPUT_DIVISOR
}

/** Quatro casas, meio para cima, como o `numeric(19,4)` do banco. */
function money(units: bigint): string {
  const rounded = (units + 50n) / 100n
  const whole = rounded / 10_000n
  const fraction = (rounded % 10_000n).toString().padStart(4, '0')
  return `${whole.toString()}.${fraction}`
}

function ratio(units: bigint): string {
  return money(units)
}
