/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetVehicleCatalogOption, FleetVehicleDetail } from './fleet.types'

export type VehicleCatalogChoice = Readonly<{ label: string; value: string }>

/**
 * Valor reservado da opção "Outro". Ele nunca chega ao cadastro: escolhê-lo limpa o campo e abre a
 * digitação — gravado, sairia como `__outro__` no lugar da marca, no CRLV e no MDF-e.
 */
export const VEHICLE_CATALOG_OTHER_VALUE = '__outro__'

export const VEHICLE_CATALOG_ENTRY_MODE = { LIST: 'list', TEXT: 'text' } as const

export type VehicleCatalogEntryMode =
  (typeof VEHICLE_CATALOG_ENTRY_MODE)[keyof typeof VEHICLE_CATALOG_ENTRY_MODE]

const WHITESPACE_PATTERN = /\s+/g

/** Dobra única de nome de marca e modelo: "Randon", "RANDON" e "  randon " são a mesma frota. */
export function normalizeVehicleCatalogName(value: string): string {
  return value.trim().toUpperCase().replace(WHITESPACE_PATTERN, ' ')
}

export function readRegisteredVehicleBrands(
  vehicles: readonly FleetVehicleDetail[],
): readonly string[] {
  return sortNames(uniqueNames(vehicles.map((vehicle) => vehicle.brand)))
}

/** Modelo fora do catálogo pertence a uma marca — os da frota inteira seriam ruído na lista. */
export function readRegisteredVehicleModels(
  input: Readonly<{ brand: string; vehicles: readonly FleetVehicleDetail[] }>,
): readonly string[] {
  const brand = normalizeVehicleCatalogName(input.brand)
  if (brand === '') return []

  const models = input.vehicles
    .filter((vehicle) => normalizeVehicleCatalogName(vehicle.brand) === brand)
    .map((vehicle) => vehicle.model)

  return sortNames(uniqueNames(models))
}

/**
 * O que a marca digitada à mão hoje devolve à lista amanhã. O catálogo FIPE não tem implemento,
 * marca regional nem cavalo antigo; quem tem é a frota. Sem esta soma cada veículo fora do catálogo
 * é redigitado do zero, e a mesma marca entra com três grafias diferentes.
 *
 * A ordem é a do provedor primeiro, a frota depois: quem lista é o catálogo, e o resto é emenda.
 */
export function buildVehicleCatalogChoices(
  input: Readonly<{
    catalog: readonly FleetVehicleCatalogOption[] | undefined
    registered: readonly string[]
    selected: string
  }>,
): readonly VehicleCatalogChoice[] {
  const names = [
    ...(input.catalog ?? []).map((option) => option.name),
    ...input.registered,
    input.selected,
  ]

  return uniqueNames(names).map((name) => ({ label: name, value: name }))
}

/**
 * Lista vazia não é escolha: sem nome no catálogo e sem nome na frota o campo já abre digitável, em
 * vez de oferecer um select com a opção "Outro" sozinha. Carregando e bloqueado por rodado seguem
 * como lista — o motivo de estarem vazios já está dito ao lado do campo.
 */
export function resolveVehicleCatalogEntryMode(
  input: Readonly<{
    choiceCount: number
    isDisabled: boolean
    isLoading: boolean
    isTyping: boolean
  }>,
): VehicleCatalogEntryMode {
  const { LIST, TEXT } = VEHICLE_CATALOG_ENTRY_MODE
  if (input.isLoading || input.isDisabled) return LIST
  if (input.isTyping) return TEXT
  return input.choiceCount === 0 ? TEXT : LIST
}

/** A primeira grafia manda: ela é a do catálogo, ou a mais antiga da frota. */
function uniqueNames(names: readonly string[]): readonly string[] {
  const seen = new Set<string>()

  return names.filter((name) => {
    const folded = normalizeVehicleCatalogName(name)
    if (folded === '' || seen.has(folded)) return false
    seen.add(folded)
    return true
  })
}

function sortNames(names: readonly string[]): readonly string[] {
  return [...names].sort((left, right) => left.localeCompare(right, 'pt-BR'))
}
