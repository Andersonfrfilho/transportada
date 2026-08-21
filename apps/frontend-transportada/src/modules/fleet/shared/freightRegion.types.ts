/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightVehicleClass } from '@/modules/shared/freightClass.constant'

export const FREIGHT_REGION_STATUS = ['active', 'inactive'] as const

export type FreightRegionStatus = (typeof FREIGHT_REGION_STATUS)[number]

export type FreightRegionCity = Readonly<{ city: string; state: string }>

/** O valor é o que a transportadora **paga** ao motorista pela viagem — nunca o que ela cobra. */
export type FreightRegionDriverRate = Readonly<{
  driverAmount: string
  freightClass: FreightVehicleClass
}>

export type FreightRegion = Readonly<{
  cities: readonly FreightRegionCity[]
  code: string
  createdAt: string
  id: string
  name: string
  rates: readonly FreightRegionDriverRate[]
  status: FreightRegionStatus
  updatedAt: string
  version: string
  zone: number
}>

export type FreightRegionPage = Readonly<{
  items: readonly FreightRegion[]
  nextCursor: null | string
}>

export type FreightRegionFilters = Readonly<{
  cityContains?: string
  statusEq?: FreightRegionStatus
}>

export type FreightRegionBodyInput = Readonly<{
  cities: readonly FreightRegionCity[]
  code: string
  name: string
  rates: readonly FreightRegionDriverRate[]
}>

export type FreightRegionUpdateInput = FreightRegionBodyInput &
  Readonly<{
    expectedVersion: string
    regionId: string
    status: FreightRegionStatus
  }>

export type FreightRegionDeleteInput = Readonly<{ regionId: string }>

/** As duas metades da planilha do cliente, texto puro — o mesmo corpo que a rota de importação lê. */
export type FreightRegionImportInput = Readonly<{ rates: string; regions: string }>

export type FreightRegionImportSummary = Readonly<{
  created: number
  deactivated: number
  updated: number
}>
