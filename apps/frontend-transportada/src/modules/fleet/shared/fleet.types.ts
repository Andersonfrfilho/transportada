/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FuelProduct, FuelUnit } from '../../shared/fuel.constant'
import type { VehicleType } from '../../shared/vehicleType.constant'
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

/**
 * Categoria da CNH, no catálogo do CONTRAN. Cópia por valor do que a API valida — o bundle não
 * carrega código dela —, e a ordem é a da carteira: da mais leve para a mais pesada, com as
 * combinadas logo depois da simples que elas somam.
 */
export const LICENSE_CATEGORIES = ['ACC', 'A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'] as const
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number]

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
  /** Consumo do segundo tanque; zero enquanto não houver produto secundário. */
  secondaryAverageConsumption: string
}>

/**
 * Parcela zerada fica de fora: `'0.0000'` diria custo zero, e o que houve foi não ter informado.
 * `primaryFuel` e `secondaryFuel` só aparecem com as duas parcelas — com uma só, `fuel` já é ela, e
 * repetir o valor ao lado não diria nada.
 */
export type FleetVehicleCostBreakdown = Readonly<{
  fuel?: string
  otherCosts?: string
  primaryFuel?: string
  secondaryFuel?: string
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
  /** As duas parcelas por trás da média, para o operador conferir contra as notas do posto. */
  primaryFuelCostPerKilometer: null | string
  secondaryFuelCostPerKilometer: null | string
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
    fuelType: FuelProduct
    model: string
    modelYear: number
    owner: FleetVehicleOwner | null
    ownership: FleetVehicleOwnership
    plate: string
    renavam: string
    role: FleetVehicleRole
    /** Vazio é um tanque só; preenchido, é sempre diferente de `fuelType`. */
    secondaryFuelType: '' | FuelProduct
    state: string
    tareWeightKilograms: string
    /** Vazio é legítimo só no implemento: é a tração que tem tipo, e o `tpRod` sai dele. */
    vehicleType: '' | VehicleType
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
    secondaryFuelPrice: FleetVehicleFuelPrice | null
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
  vehicleType: '' | VehicleType
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
  /** Mesma categoria da ANTT que o proprietário do veículo declara ao MDF-e. */
  anttCategory: '' | MdfeOwnerTaxRegime
  /** Naturalidade; a cidade pode existir sem a UF em ficha antiga, e nenhuma exige a outra. */
  birthCity: string
  birthDate: null | string
  birthState: string
  email: string
  /** Filiação, como a CNH imprime. Opcional: nem toda carteira traz as duas linhas. */
  fatherName: string
  /** Data da primeira habilitação — o que a carteira imprime como "1ª habilitação". */
  firstLicenseAt: null | string
  /** Categoria da CNH; vazia enquanto a ficha não a declara. */
  licenseCategory: '' | LicenseCategory
  licenseExpiresAt: null | string
  /** Município do DETRAN que emitiu a carteira, com a UF ao lado. */
  licenseIssuedCity: string
  licenseIssuedState: string
  licenseNumber: string
  /** Razão social da empresa do motorista; pende do CNPJ, e a metade contrária fica solta. */
  linkedLegalName: string
  /** CNPJ da empresa do motorista autônomo; vazio quando ele dirige só como pessoa física. */
  linkedTaxId: string
  membershipId: null | string
  motherName: string
  name: string
  nationality: string
  phone: string
  rntrc: string
  taxId: string
}>

/**
 * O agregado costuma dirigir o veículo dele; o motorista dirige o próprio ou o da empresa. Cópia por
 * valor do catálogo da API: o bundle não carrega código dela, e a paridade é contrato de teste.
 */
export const FLEET_DRIVER_PROFILES = ['aggregate', 'driver'] as const
export type FleetDriverProfile = (typeof FLEET_DRIVER_PROFILES)[number]

/**
 * O vínculo não vem do formulário de criação: ele nasce do usuário que a criação abre. O que o
 * operador escolhe é o perfil desse usuário, e a API o recusa em qualquer outro corpo.
 */
export type FleetDriverCreateBody = Omit<FleetDriverBody, 'membershipId'> &
  Readonly<{ profile: FleetDriverProfile }>

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

/** A resposta da conferência prévia: um booleano por campo único, sem dizer de quem é a colisão. */
export type FleetDriverAvailability = Readonly<{
  emailTaken: boolean
  licenseNumberTaken: boolean
  taxIdTaken: boolean
}>

export type FleetDriverAvailabilityInput = Readonly<{
  /** A ficha aberta não colide consigo mesma; no cadastro novo ainda não há id. */
  driverId: null | string
  email: string
  licenseNumber: string
  signal?: AbortSignal
  taxId: string
}>

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
    secondaryFuelType: '' | FuelProduct
    state: string
    tareWeightKilograms: string
    vehicleType: '' | VehicleType
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
  anttCategory: string
  birthCity: string
  birthDate: string
  birthState: string
  email: string
  fatherName: string
  firstLicenseAt: string
  licenseCategory: string
  licenseExpiresAt: string
  licenseIssuedCity: string
  licenseIssuedState: string
  licenseNumber: string
  linkedLegalName: string
  linkedTaxId: string
  motherName: string
  name: string
  nationality: string
  phone: string
  /** Só a criação o usa: a ficha carregada não o traz, porque a API não devolve papel de usuário. */
  profile: FleetDriverProfile
  rntrc: string
  /** Só do formulário: a API guarda um nome só, e o corpo junta as duas partes de volta. */
  surname: string
  taxId: string
}>

export type FleetListInput<TFilters> = Readonly<{
  cursor: null | string
  filters?: TFilters
  limit: number
}>
