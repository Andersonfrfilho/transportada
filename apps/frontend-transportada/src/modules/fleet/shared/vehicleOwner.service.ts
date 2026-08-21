/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type DriverFocusField } from './driverFieldFocus.service'
import type { FleetDriverDetail, MdfeOwnerTaxRegime } from './fleet.types'

/** Os cinco campos do grupo do proprietário do MDF-e, como o formulário do veículo os guarda. */
export type DerivedVehicleOwner = Readonly<{
  ownerName: string
  ownerRntrc: string
  ownerState: string
  ownerTaxId: string
  ownerTaxRegime: MdfeOwnerTaxRegime
}>

/**
 * Documento só de zero é campo que ainda não foi preenchido, não empresa: a ficha o guarda até o
 * CNPJ verdadeiro chegar, e mandá-lo ao grupo de proprietário do MDF-e é rejeição na SEFAZ.
 */
export function isPlaceholderTaxId(value: string): boolean {
  return value !== '' && /^0+$/.test(value)
}

/**
 * O agregado que dirige pela empresa dele é o CNPJ vinculado; quem dirige como pessoa é o CPF da
 * ficha. Ficha sem categoria ANTT vale TAC agregado, que é o padrão do formulário desde sempre.
 */
export function toVehicleOwnerFields(driver: FleetDriverDetail): DerivedVehicleOwner {
  const hasLinkedCompany = driver.linkedTaxId !== '' && !isPlaceholderTaxId(driver.linkedTaxId)

  return {
    ownerName:
      hasLinkedCompany && driver.linkedLegalName !== '' ? driver.linkedLegalName : driver.name,
    ownerRntrc: driver.rntrc,
    ownerState: driver.address.state,
    ownerTaxId: hasLinkedCompany ? driver.linkedTaxId : driver.taxId,
    ownerTaxRegime: driver.anttCategory === '' ? '0' : driver.anttCategory,
  }
}

/**
 * O veículo guarda o documento, não o id do motorista: quem casa os dois é qualquer um dos dois
 * documentos da ficha — a API aceita os dois na posse do veículo. Documento vazio não casa com nada.
 */
export function findVehicleOwnerDriver(
  input: Readonly<{ drivers: readonly FleetDriverDetail[]; ownerTaxId: string }>,
): FleetDriverDetail | undefined {
  if (input.ownerTaxId === '') return undefined

  return input.drivers.find(
    (driver) => driver.taxId === input.ownerTaxId || driver.linkedTaxId === input.ownerTaxId,
  )
}

/** O grupo <prop> do MDF-e é tudo-ou-nada: a API recusa o veículo inteiro se faltar um destes. */
export const VEHICLE_OWNER_REQUIRED_FIELDS = [
  'ownerName',
  'ownerRntrc',
  'ownerState',
  'ownerTaxId',
] as const

export type VehicleOwnerRequiredField = (typeof VEHICLE_OWNER_REQUIRED_FIELDS)[number]

type VehicleOwnerCompletenessInput = Readonly<{
  ownerName: string
  ownerRntrc: string
  ownerState: string
  ownerTaxId: string
  ownership: string
}>

/**
 * A falta é da ficha do motorista, não do formulário do veículo: sem dizer qual campo falta, o
 * operador recebia o 400 genérico e não tinha como saber que a UF do agregado é que estava vazia.
 */
export function listIncompleteVehicleOwnerFields(
  state: VehicleOwnerCompletenessInput,
): readonly VehicleOwnerRequiredField[] {
  if (state.ownership === 'own') return []
  return VEHICLE_OWNER_REQUIRED_FIELDS.filter((field) => state[field].trim() === '')
}

/**
 * O campo do veículo é derivado; quem se corrige é o campo da ficha do motorista. Vazio do lado de
 * cá sempre significa vazio de um campo só do lado de lá: com empresa vinculada sem razão social o
 * nome do proprietário cai no nome da pessoa, e o mesmo vale para o documento.
 */
const DRIVER_FIELD_OF_OWNER_FIELD: Readonly<Record<VehicleOwnerRequiredField, DriverFocusField>> = {
  ownerName: 'name',
  ownerRntrc: 'rntrc',
  ownerState: 'addressState',
  ownerTaxId: 'taxId',
}

/** O aviso leva a um campo só — o primeiro na ordem do grupo; os outros aparecem na própria ficha. */
export function resolveVehicleOwnerFixField(
  fields: readonly VehicleOwnerRequiredField[],
): DriverFocusField | undefined {
  const first = VEHICLE_OWNER_REQUIRED_FIELDS.find((field) => fields.includes(field))
  return first === undefined ? undefined : DRIVER_FIELD_OF_OWNER_FIELD[first]
}
