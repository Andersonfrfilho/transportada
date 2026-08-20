/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightVehicleClass } from '../../shared/freightClass.constant'
import type { FuelProduct, FuelUnit } from '../../shared/fuel.constant'
import type { FleetDriverCoverageEntry } from './driverCoverage.service'

/** A origem do preço efetivo: a série pública da ANP ou o ajuste da própria transportadora. */
export const FLEET_FUEL_PRICE_SOURCE = ['anp', 'manual'] as const
export type FleetFuelPriceSource = (typeof FLEET_FUEL_PRICE_SOURCE)[number]

export const FLEET_VEHICLE_ROLE = ['traction', 'trailer'] as const
export type FleetVehicleRole = (typeof FLEET_VEHICLE_ROLE)[number]

export const FLEET_VEHICLE_STATUS = ['active', 'inactive'] as const
export type FleetVehicleStatus = (typeof FLEET_VEHICLE_STATUS)[number]

export const FLEET_VEHICLE_OWNERSHIP = ['own', 'aggregate', 'third_party'] as const
export type FleetVehicleOwnership = (typeof FLEET_VEHICLE_OWNERSHIP)[number]

/** tpRod — 01 truck, 02 toco, 03 cavalo mecânico, 04 VAN, 05 utilitário, 06 outros. */
export const MDFE_WHEEL_TYPE = ['01', '02', '03', '04', '05', '06'] as const
export type MdfeWheelType = (typeof MDFE_WHEEL_TYPE)[number]

/**
 * Lista fechada — texto livre gerava "prata metálico" e "PRATA" na mesma frota. A base é a tabela
 * do Denatran, que é o que o CRLV imprime; `azul_marinho`, `champanhe`, `creme`, `grafite` e
 * `turquesa` são tons de mercado que ela não nomeia. Alargar é seguro porque cor aqui é cadastro
 * nosso: nenhum documento fiscal a transmite — o MDF-e leva tpRod e tpCar, não a cor.
 */
export const VEHICLE_COLOR = [
  'amarela',
  'azul',
  'azul_marinho',
  'bege',
  'branca',
  'champanhe',
  'cinza',
  'creme',
  'dourada',
  'fantasia',
  'grafite',
  'grena',
  'laranja',
  'marrom',
  'prata',
  'preta',
  'rosa',
  'roxa',
  'turquesa',
  'verde',
  'vermelha',
] as const
export type VehicleColor = (typeof VEHICLE_COLOR)[number]

/** tpCar — 00 não aplicável, 01 aberta, 02 fechada/baú, 03 granelera, 04 porta container, 05 sider. */
export const MDFE_BODY_TYPE = ['00', '01', '02', '03', '04', '05'] as const
export type MdfeBodyType = (typeof MDFE_BODY_TYPE)[number]

/** tpProp — 0 TAC agregado, 1 TAC independente, 2 outros. */
export const MDFE_OWNER_TAX_REGIME = ['0', '1', '2'] as const
export type MdfeOwnerTaxRegime = (typeof MDFE_OWNER_TAX_REGIME)[number]

/** A UF é fechada em 27, e é o que a API valida: `/^[A-Z]{2}$/` aceita 'XX' que não existe. */
export const BRAZIL_STATE = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const
export type BrazilState = (typeof BRAZIL_STATE)[number]

export const FLEET_DRIVER_STATUS = ['active', 'inactive'] as const
export type FleetDriverStatus = (typeof FLEET_DRIVER_STATUS)[number]

/**
 * Campo de lista fechada que precisa de saída: `list` escolhe da lista, `text` digita. Catálogo de
 * veículo e município compartilham o vocabulário — dois nomes para o mesmo par abriria a porta para
 * um lado chamar de `manual` o que o outro chama de `text`.
 */
export const FLEET_FIELD_ENTRY_MODE = { LIST: 'list', TEXT: 'text' } as const
export type FleetFieldEntryMode =
  (typeof FLEET_FIELD_ENTRY_MODE)[keyof typeof FLEET_FIELD_ENTRY_MODE]

export type FleetVehicleOwner = Readonly<{
  name: string
  rntrc: string
  state: string
  taxId: string
  taxRegime: MdfeOwnerTaxRegime
}>

/** Custos do veículo em decimal string: dinheiro em quatro casas, consumo em duas. */
export type FleetVehicleCostFields = Readonly<{
  acquisitionAmount: string
  annualInsuranceAmount: string
  annualVehicleTaxAmount: string
  averageConsumption: string
  monthlyInstallmentAmount: string
  otherCostsPerKilometer: string
}>

/** Parcela zerada fica de fora: `'0.0000'` diria custo zero, e o que houve foi não ter informado. */
export type FleetVehicleCostBreakdown = Readonly<{
  fuel?: string
  otherCosts?: string
}>

/** Preço efetivo do combustível do veículo, com a origem e a semana de referência da ANP. */
export type FleetVehicleFuelPrice = Readonly<{
  pricePerUnit: string
  source: FleetFuelPriceSource
  unit: FuelUnit
  weekEndingOn: null | string
}>

/** Composição e totais já em moeda; `null` quando a parcela não existe. */
export type FleetVehicleCostSummary = Readonly<{
  costPerKilometer: null | string
  fuelCostPerKilometer: null | string
  monthlyFixedCost: null | string
  otherCostsPerKilometer: null | string
}>

export type FleetVehicleBody = FleetVehicleCostFields &
  Readonly<{
    axleCount: number
    bodyType: MdfeBodyType
    brand: string
    capacityCubicMeters: string
    capacityKilograms: string
    color: string
    fleetNumber: string
    /** Vazio é legítimo: cavalo mecânico e implemento não estão na tabela de frete do cliente. */
    freightClass: '' | FreightVehicleClass
    fuelType: FuelProduct
    model: string
    modelYear: number
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
    /** Derivado pela API — preço do combustível ÷ consumo, mais os outros custos por km. */
    costPerKilometer: null | string
    costPerKilometerBreakdown: FleetVehicleCostBreakdown | null
    costsUpdatedAt: null | string
    createdAt: string
    fuelPrice: FleetVehicleFuelPrice | null
    id: string
    /** Derivado pela API — prestação + (IPVA + seguro) ÷ 12. */
    monthlyFixedCost: null | string
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

export type FleetCapabilities = Readonly<{ vehicleCatalog: boolean }>

export const FLEET_VEHICLE_CATALOG_SOURCE = ['fipe', 'none', 'unavailable'] as const
export type FleetVehicleCatalogSource = (typeof FLEET_VEHICLE_CATALOG_SOURCE)[number]

export type FleetVehicleCatalogOption = Readonly<{ code: string; name: string }>

export type FleetVehicleCatalogResult = Readonly<{
  items: readonly FleetVehicleCatalogOption[]
  source: FleetVehicleCatalogSource
}>

export type FleetVehicleCatalogBrandsInput = Readonly<{
  role: FleetVehicleRole
  wheelType: '' | MdfeWheelType
}>

export type FleetVehicleCatalogModelsInput = FleetVehicleCatalogBrandsInput &
  Readonly<{ brand: string }>

/** Endereço parcial é cadastro em andamento: cada campo vazio é ausência, não erro. */
export type FleetDriverAddress = Readonly<{
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type FleetDriverBody = Readonly<{
  address: FleetDriverAddress
  birthDate: null | string
  licenseExpiresAt: null | string
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

export type FleetDriverRegionsInput = Readonly<{ driverId: string }>

export type FleetReplaceDriverRegionsInput = Readonly<{
  driverId: string
  entries: readonly FleetDriverCoverageEntry[]
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

export type FleetVehicleFormState = FleetVehicleCostFields &
  Readonly<{
    axleCount: string
    bodyType: MdfeBodyType
    brand: string
    capacityCubicMeters: string
    capacityKilograms: string
    color: '' | VehicleColor
    fleetNumber: string
    freightClass: '' | FreightVehicleClass
    fuelType: FuelProduct
    model: string
    modelYear: string
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
    wheelType: '' | MdfeWheelType
  }>

/** Datas viajam como string vazia no formulário: `null` é o que o corpo da API recebe. */
export type FleetDriverFormState = Readonly<{
  addressCity: string
  addressComplement: string
  addressDistrict: string
  addressNumber: string
  addressPostalCode: string
  addressState: string
  addressStreet: string
  birthDate: string
  licenseExpiresAt: string
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
