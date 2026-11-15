/* Copyright (c) 2026 Ada Technology. MIT License. */

export const FREIGHT_QUOTE_PERMISSION = 'freight.simulate'
export const FREIGHT_QUOTE_SETTINGS_PERMISSION = 'settings.manage'

export type FreightQuoteSettingsValues = Readonly<{
  adValoremPercent: string
  applyAnttFloor: boolean
  driverCostPerKm: string
  expectedOccupancyPercent: string
  fixedCostPerKm: string
  fuelKmPerLiter: string | null
  grisPercent: string
  maintenanceCostPerKm: string
  marginPercent: string
  tiresCostPerKm: string
}>

export type FreightQuoteCargoType = Readonly<{ code: number; label: string }>

export type FreightQuoteSettings = Readonly<{
  anttFloor: Readonly<{
    axles: readonly number[]
    cargoTypes: readonly FreightQuoteCargoType[]
    source: Readonly<{ effectiveFrom: string; resolution: string; url: string }>
  }>
  defaults: FreightQuoteSettingsValues
  origin: 'company' | 'default'
  updatedAt: string | null
  values: FreightQuoteSettingsValues
}>

export type FreightQuoteInput = Readonly<{
  axles: number
  cargoType: number
  cargoValue: string
  distanceKm: string
  fuelPricePerLitre: string | null
  highPerformance: boolean
  shareOfVehiclePercent: string
  tollAmount: string
}>

export type FreightQuoteResult = Readonly<{
  adValoremAmount: string
  anttFloor: Readonly<{
    applied: boolean
    axlesUsed: number
    cc: string
    ccd: string
    floorAmount: string
    table: 'A' | 'C'
  }> | null
  costShareFactor: string
  freightAmount: string
  fuelKmPerLiter: string
  fuelKmPerLiterOrigin: 'company' | 'reference'
  fuelPriceOrigin: 'company-or-anp' | 'informed'
  fuelPricePerLitre: string
  grisAmount: string
  lines: readonly Readonly<{ amount: string; key: string }>[]
  marginAmount: string
  settingsOrigin: 'company' | 'default'
  shipmentCostAmount: string
  totalAmount: string
  tripCostAmount: string
}>
