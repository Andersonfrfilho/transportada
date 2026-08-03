/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_VEHICLE_ROLE = ['traction', 'trailer'] as const
export type FleetVehicleRole = (typeof FLEET_VEHICLE_ROLE)[number]

export const FLEET_VEHICLE_STATUS = ['active', 'inactive'] as const
export type FleetVehicleStatus = (typeof FLEET_VEHICLE_STATUS)[number]

export const FLEET_VEHICLE_OWNERSHIP = ['own', 'aggregate', 'third_party'] as const
export type FleetVehicleOwnership = (typeof FLEET_VEHICLE_OWNERSHIP)[number]

/** tpRod — 01 truck, 02 toco, 03 cavalo mecânico, 04 VAN, 05 utilitário, 06 outros. */
export const MDFE_WHEEL_TYPE = ['01', '02', '03', '04', '05', '06'] as const
export type MdfeWheelType = (typeof MDFE_WHEEL_TYPE)[number]

/** tpCar — 00 não aplicável, 01 aberta, 02 fechada/baú, 03 granelera, 04 porta container, 05 sider. */
export const MDFE_BODY_TYPE = ['00', '01', '02', '03', '04', '05'] as const
export type MdfeBodyType = (typeof MDFE_BODY_TYPE)[number]

/** tpProp — 0 TAC agregado, 1 TAC independente, 2 outros. */
export const MDFE_OWNER_TAX_REGIME = ['0', '1', '2'] as const
export type MdfeOwnerTaxRegime = (typeof MDFE_OWNER_TAX_REGIME)[number]

export const FLEET_DRIVER_STATUS = ['active', 'inactive'] as const
export type FleetDriverStatus = (typeof FLEET_DRIVER_STATUS)[number]

export type FleetVehicleOwner = Readonly<{
  name: string
  rntrc: string
  state: string
  taxId: string
  taxRegime: MdfeOwnerTaxRegime
}>

export type FleetVehicleBody = Readonly<{
  bodyType: MdfeBodyType
  capacityCubicMeters: string
  capacityKilograms: string
  owner: FleetVehicleOwner | null
  ownership: FleetVehicleOwnership
  plate: string
  renavam: string
  role: FleetVehicleRole
  state: string
  tareWeightKilograms: string
  wheelType: '' | MdfeWheelType
}>

export type FleetVehicleDetail = FleetVehicleBody &
  Readonly<{
    createdAt: string
    id: string
    status: FleetVehicleStatus
    updatedAt: string
    version: string
  }>

export type FleetVehicleVersionInput = Readonly<{
  expectedVersion: string
  status: FleetVehicleStatus
  vehicleId: string
}>

export type FleetVehicleFilters = Readonly<{
  plateContains?: string
  roleEq?: FleetVehicleRole
  statusEq?: FleetVehicleStatus
}>

export type FleetVehiclePage = Readonly<{
  items: readonly FleetVehicleDetail[]
  nextCursor: null | string
}>

/** Resposta já traduzida da consulta por placa; marca, modelo e ano são só para conferência visual. */
export type FleetVehicleLookup = Readonly<{
  brand: string
  capacityKilograms: string
  model: string
  modelYear: string
  ownerName: string
  ownerTaxId: string
  plate: string
  renavam: string
  state: string
  tareWeightKilograms: string
}>

export type FleetCapabilities = Readonly<{ vehicleLookup: boolean }>

export type FleetDriverBody = Readonly<{
  licenseNumber: string
  /** CNPJ da empresa do motorista autônomo; vazio quando ele dirige só como pessoa física. */
  linkedTaxId: string
  membershipId: null | string
  name: string
  phone: string
  taxId: string
}>

export type FleetDriverDetail = FleetDriverBody &
  Readonly<{
    createdAt: string
    id: string
    status: FleetDriverStatus
    updatedAt: string
    version: string
  }>

/** `ownedByDriver` é derivado na API comparando o dono do veículo com o CPF/CNPJ do motorista. */
export type FleetDriverVehicleLink = Readonly<{
  assignedAt: string
  id: string
  ownedByDriver: boolean
  vehicle: FleetVehicleDetail
}>

export type FleetDriverVehiclesInput = Readonly<{ driverId: string }>

export type FleetReplaceDriverVehiclesInput = Readonly<{
  driverId: string
  vehicleIds: readonly string[]
}>

export type FleetDriverVersionInput = Readonly<{
  driverId: string
  expectedVersion: string
  status: FleetDriverStatus
}>

export type FleetDriverFilters = Readonly<{
  nameContains?: string
  statusEq?: FleetDriverStatus
}>

export type FleetDriverPage = Readonly<{
  items: readonly FleetDriverDetail[]
  nextCursor: null | string
}>

export type FleetVehicleFormState = Readonly<{
  bodyType: MdfeBodyType
  capacityCubicMeters: string
  capacityKilograms: string
  ownerName: string
  ownerRntrc: string
  ownerState: string
  ownerTaxId: string
  ownerTaxRegime: MdfeOwnerTaxRegime
  ownership: FleetVehicleOwnership
  plate: string
  renavam: string
  role: FleetVehicleRole
  state: string
  tareWeightKilograms: string
  wheelType: MdfeWheelType
}>

export type FleetDriverFormState = Readonly<{
  licenseNumber: string
  linkedTaxId: string
  membershipId: string
  name: string
  phone: string
  taxId: string
}>

export type FleetListInput<TFilters> = Readonly<{
  cursor: null | string
  filters?: TFilters
  limit: number
}>
