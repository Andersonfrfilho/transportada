/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DamdfeDischargeCity = Readonly<{
  cteKeys: readonly string[]
  name: string
  nfeKeys: readonly string[]
}>

export type DamdfeDriver = Readonly<{ name: string; taxId: string }>

export type DamdfeEmitter = Readonly<{
  address: string
  name: string
  stateRegistration: string
  taxId: string
}>

export type DamdfeVehicle = Readonly<{ capacityKg: string; plate: string; tare: string }>

/** O que o DAMDFE imprime, lido do XML autorizado e de mais nada. */
export type DamdfeDocument = Readonly<{
  accessKey: string
  additionalInformation: string
  authorizedAt: string
  cargoValue: string
  cargoWeight: string
  cteCount: string
  destinationState: string
  dischargeCities: readonly DamdfeDischargeCity[]
  drivers: readonly DamdfeDriver[]
  emitter: DamdfeEmitter
  environment: 'homologation' | 'production'
  issuedAt: string
  loadingCities: readonly string[]
  modal: string
  nfeCount: string
  number: string
  originState: string
  protocol: string
  rntrc: string
  series: string
  trailerPlates: readonly string[]
  vehicle: DamdfeVehicle
}>
