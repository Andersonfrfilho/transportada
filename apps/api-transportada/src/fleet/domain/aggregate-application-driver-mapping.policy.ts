/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetVehicleRole,
  MdfeBodyType,
  MdfeOwnerTaxRegime,
} from '../../database/fleet.schema.js'
import type { FuelProduct } from '../../shared/fuel.constant.js'
import type { IdentityDocumentIssuer } from '../../shared/identity-document-issuer.constant.js'
import type { LicenseCategory } from '../../shared/license-category.constant.js'
import type { PixKeyType } from '../../shared/pix-key-type.constant.js'
import { CPF_PATTERN } from '../../shared/tax-id.service.js'
import type { VehicleType } from '../../shared/vehicle-type.constant.js'

/**
 * Forma estrutural do que a candidatura declarou — o schema de validação em `presentation/`
 * infere um tipo compatível com este (mesmos campos, todos opcionais); o domínio não importa de lá
 * de propósito, para a regra de mapeamento não depender de zod nem da camada HTTP.
 */
type DeclaredAddress = Partial<
  Readonly<{
    city: string
    complement: string
    district: string
    number: string
    postalCode: string
    state: string
    street: string
  }>
>

export type AggregateApplicationDeclaredDriver = Partial<
  Readonly<{
    address: DeclaredAddress
    anttCategory: MdfeOwnerTaxRegime
    birthCity: string
    birthDate: string
    birthState: string
    fatherName: string
    firstLicenseAt: string
    identityDocument: string
    identityDocumentIssuer: IdentityDocumentIssuer
    identityDocumentState: string
    licenseCategory: LicenseCategory
    licenseExpiresAt: string
    licenseIssuedCity: string
    licenseIssuedState: string
    licenseNumber: string
    linkedAddress: DeclaredAddress
    linkedLegalName: string
    linkedTaxId: string
    motherName: string
    nationality: string
    pixKey: string
    pixKeyType: PixKeyType
    rntrc: string
  }>
>

export type AggregateApplicationDeclaredVehicle = Partial<
  Readonly<{
    axleCount: number
    bodyType: MdfeBodyType
    brand: string
    capacityCubicMeters: string
    capacityKilograms: string
    color: string
    fuelType: FuelProduct
    model: string
    modelYear: number
    plate: string
    renavam: string
    role: FleetVehicleRole
    state: string
    tareWeightKilograms: string
    vehicleType: VehicleType
  }>
>

export type AggregateApplicationDeclaredData = Partial<
  Readonly<{
    driver: AggregateApplicationDeclaredDriver
    vehicle: AggregateApplicationDeclaredVehicle
  }>
>

function addressFields(
  address: DeclaredAddress | undefined,
): Readonly<{
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}> {
  return {
    city: address?.city ?? '',
    complement: address?.complement ?? '',
    district: address?.district ?? '',
    number: address?.number ?? '',
    postalCode: address?.postalCode ?? '',
    state: address?.state ?? '',
    street: address?.street ?? '',
  }
}

export type MappedFleetDriverInput = Readonly<{
  anttCategory: MdfeOwnerTaxRegime | ''
  birthCity: string
  birthDate: string | null
  birthState: string
  city: string
  complement: string
  district: string
  email: string
  fatherName: string
  firstLicenseAt: string | null
  identityDocument: string
  identityDocumentIssuer: IdentityDocumentIssuer | ''
  identityDocumentState: string
  licenseCategory: LicenseCategory | ''
  licenseExpiresAt: string | null
  licenseIssuedCity: string
  licenseIssuedState: string
  licenseNumber: string
  linkedCity: string
  linkedComplement: string
  linkedDistrict: string
  linkedLegalName: string
  linkedNumber: string
  linkedPostalCode: string
  linkedState: string
  linkedStreet: string
  linkedTaxId: string
  motherName: string
  name: string
  nationality: string
  number: string
  phone: string
  pixKey: string
  pixKeyType: PixKeyType | ''
  postalCode: string
  rntrc: string
  state: string
  street: string
  taxId: string
}>

/**
 * A candidatura vira ficha completa na aprovação — é o que fecha o gap que existia antes: uma
 * ficha aprovada com só nome e CPF não emite MDF-e nenhum. Tudo que a candidatura não declarou
 * chega como texto vazio, o mesmo "não preenchido ainda" que uma ficha criada manualmente carrega.
 */
export function mapDeclaredDataToDriverInput(input: {
  readonly declaredData: AggregateApplicationDeclaredData
  readonly email: string
  readonly name: string
  readonly phone: string
  readonly taxId: string
}): MappedFleetDriverInput {
  const driver = input.declaredData.driver
  const address = addressFields(driver?.address)
  const linkedAddress = addressFields(driver?.linkedAddress)

  return {
    anttCategory: driver?.anttCategory ?? '',
    birthCity: driver?.birthCity ?? '',
    birthDate: driver?.birthDate ?? null,
    birthState: driver?.birthState ?? '',
    city: address.city,
    complement: address.complement,
    district: address.district,
    email: input.email,
    fatherName: driver?.fatherName ?? '',
    firstLicenseAt: driver?.firstLicenseAt ?? null,
    identityDocument: driver?.identityDocument ?? '',
    identityDocumentIssuer: driver?.identityDocumentIssuer ?? '',
    identityDocumentState: driver?.identityDocumentState ?? '',
    licenseCategory: driver?.licenseCategory ?? '',
    licenseExpiresAt: driver?.licenseExpiresAt ?? null,
    licenseIssuedCity: driver?.licenseIssuedCity ?? '',
    licenseIssuedState: driver?.licenseIssuedState ?? '',
    licenseNumber: driver?.licenseNumber ?? '',
    linkedCity: linkedAddress.city,
    linkedComplement: linkedAddress.complement,
    linkedDistrict: linkedAddress.district,
    linkedLegalName: driver?.linkedLegalName ?? '',
    linkedNumber: linkedAddress.number,
    linkedPostalCode: linkedAddress.postalCode,
    linkedState: linkedAddress.state,
    linkedStreet: linkedAddress.street,
    linkedTaxId: driver?.linkedTaxId ?? '',
    motherName: driver?.motherName ?? '',
    name: input.name,
    nationality: driver?.nationality ?? '',
    number: address.number,
    phone: input.phone,
    pixKey: driver?.pixKey ?? '',
    pixKeyType: driver?.pixKeyType ?? '',
    postalCode: address.postalCode,
    rntrc: driver?.rntrc ?? '',
    state: address.state,
    street: address.street,
    taxId: input.taxId,
  }
}

export type MappedFleetVehicleInput = Readonly<{
  axleCount: number
  bodyType: MdfeBodyType
  brand: string
  capacityCubicMeters: string
  capacityKilograms: string
  color: string
  fuelType: FuelProduct
  model: string
  modelYear: number
  plate: string
  renavam: string
  role: FleetVehicleRole
  state: string
  tareWeightKilograms: string
  vehicleType: VehicleType | ''
}>

export type MappedFleetVehicleOwnerFields = Readonly<{
  ownerName: string
  ownerRntrc: string
  ownerState: string
  ownerTaxId: string
  ownerTaxRegime: MdfeOwnerTaxRegime | ''
  ownership: 'aggregate' | 'own'
}>

/**
 * `fleet_vehicles_owner_check` exige as cinco colunas de dono preenchidas juntas, ou nenhuma. O
 * agregado é dono do próprio veículo — mas só dá pra gravar isso se a candidatura trouxe RNTRC,
 * UF e regime tributário; sem os três, o veículo nasce como `own` (sem dono declarado) e o
 * operador completa a titularidade na revisão, em vez de a aprovação inventar RNTRC inválido.
 */
export function resolveVehicleOwnerFields(input: {
  readonly driver: MappedFleetDriverInput
  readonly name: string
  readonly taxId: string
}): MappedFleetVehicleOwnerFields {
  const ownerRntrc = input.driver.rntrc
  const ownerState = input.driver.state
  const ownerTaxRegime = input.driver.anttCategory

  if (ownerRntrc === '' || ownerState === '' || ownerTaxRegime === '') {
    return { ownerName: '', ownerRntrc: '', ownerState: '', ownerTaxId: '', ownerTaxRegime: '', ownership: 'own' }
  }

  return {
    ownerName: input.name,
    ownerRntrc,
    ownerState,
    ownerTaxId: input.taxId,
    ownerTaxRegime,
    ownership: 'aggregate',
  }
}

/**
 * Sem placa declarada, o agregado não trouxe veículo nenhum ainda — a aprovação cria só a ficha do
 * motorista, e o operador cadastra o veículo depois (o veículo é, por natureza, a metade que muda:
 * o agregado troca de caminhão com mais frequência do que troca de CNH).
 */
export function hasDeclaredVehicle(
  vehicle: AggregateApplicationDeclaredVehicle | undefined,
): boolean {
  return (vehicle?.plate ?? '').trim().length > 0
}

/**
 * `fleet_vehicles_state_check` exige UF válida na placa — sempre, sem exceção de "não preenchido".
 * Quando a candidatura não declarou a UF do veículo, a UF do endereço do próprio motorista é o
 * melhor palpite disponível (o veículo normalmente está emplacado onde o agregado mora); ainda
 * assim pode não bater com a placa real, e cabe ao operador corrigir na revisão da ficha.
 */
export function mapDeclaredDataToVehicleInput(
  vehicle: AggregateApplicationDeclaredVehicle,
  fallbackState: string = '',
): MappedFleetVehicleInput {
  return {
    axleCount: vehicle.axleCount ?? 0,
    bodyType: vehicle.bodyType ?? '00',
    brand: vehicle.brand ?? '',
    capacityCubicMeters: vehicle.capacityCubicMeters ?? '0',
    capacityKilograms: vehicle.capacityKilograms ?? '0',
    color: vehicle.color ?? '',
    fuelType: vehicle.fuelType ?? 'diesel-s10',
    model: vehicle.model ?? '',
    modelYear: vehicle.modelYear ?? 0,
    plate: vehicle.plate ?? '',
    renavam: vehicle.renavam ?? '',
    role: vehicle.role ?? 'traction',
    state: vehicle.state ?? (fallbackState.length > 0 ? fallbackState : 'SP'),
    tareWeightKilograms: vehicle.tareWeightKilograms ?? '0',
    vehicleType: vehicle.vehicleType ?? '',
  }
}

/** O condutor do MDF-e é sempre pessoa física — mapear pessoa jurídica direto criaria ficha inválida. */
export function isCpfTaxId(taxId: string): boolean {
  return CPF_PATTERN.test(taxId)
}
