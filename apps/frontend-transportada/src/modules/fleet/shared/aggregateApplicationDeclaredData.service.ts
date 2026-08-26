/* Copyright (c) 2026 Ada Technology. MIT License. */

export type DeclaredAddress = Readonly<{
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type DeclaredDriver = Readonly<{
  address: DeclaredAddress | null
  anttCategory: string
  licenseCategory: string
  licenseNumber: string
  rntrc: string
}>

export type DeclaredVehicle = Readonly<{
  brand: string
  model: string
  modelYear: number | null
  plate: string
  vehicleType: string
}>

export type ParsedDeclaredData = Readonly<{
  driver: DeclaredDriver | null
  vehicle: DeclaredVehicle | null
}>

/**
 * `declaredData` chega da API como `Record<string, unknown>` — a candidatura é preenchida por
 * quem não está autenticado, então nada aqui é garantido presente nem no formato certo. Ler campo
 * a campo com fallback, nunca confiar num `as` direto no objeto inteiro.
 */
export function parseDeclaredData(declaredData: Readonly<Record<string, unknown>>): ParsedDeclaredData {
  return {
    driver: parseDriver(asRecord(declaredData.driver)),
    vehicle: parseVehicle(asRecord(declaredData.vehicle)),
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseAddress(value: Readonly<Record<string, unknown>> | null): DeclaredAddress | null {
  if (value === null) return null
  const address: DeclaredAddress = {
    city: asText(value.city),
    complement: asText(value.complement),
    district: asText(value.district),
    number: asText(value.number),
    postalCode: asText(value.postalCode),
    state: asText(value.state),
    street: asText(value.street),
  }
  const isEmpty = Object.values(address).every((field) => field === '')
  return isEmpty ? null : address
}

function parseDriver(value: Readonly<Record<string, unknown>> | null): DeclaredDriver | null {
  if (value === null) return null
  const driver: DeclaredDriver = {
    address: parseAddress(asRecord(value.address)),
    anttCategory: asText(value.anttCategory),
    licenseCategory: asText(value.licenseCategory),
    licenseNumber: asText(value.licenseNumber),
    rntrc: asText(value.rntrc),
  }
  const isEmpty =
    driver.address === null &&
    driver.anttCategory === '' &&
    driver.licenseCategory === '' &&
    driver.licenseNumber === '' &&
    driver.rntrc === ''
  return isEmpty ? null : driver
}

function parseVehicle(value: Readonly<Record<string, unknown>> | null): DeclaredVehicle | null {
  if (value === null) return null
  const vehicle: DeclaredVehicle = {
    brand: asText(value.brand),
    model: asText(value.model),
    modelYear: asNumber(value.modelYear),
    plate: asText(value.plate),
    vehicleType: asText(value.vehicleType),
  }
  return vehicle.plate === '' ? null : vehicle
}

export function formatDeclaredAddress(address: DeclaredAddress): string {
  const line = [address.street, address.number].filter((part) => part !== '').join(', ')
  const complement = address.complement === '' ? '' : ` (${address.complement})`
  const cityState = [address.city, address.state].filter((part) => part !== '').join('/')
  return [`${line}${complement}`, address.district, cityState, address.postalCode]
    .filter((part) => part !== '')
    .join(' — ')
}
