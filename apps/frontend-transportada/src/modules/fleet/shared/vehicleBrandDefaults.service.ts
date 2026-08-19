/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DEFAULT_FUEL_PRODUCT } from '../../shared/fuel.constant'
import { toVehicleFormState } from './fleetForm.service'
import type { FleetVehicleDetail, FleetVehicleFormState } from './fleet.types'

/**
 * O que a marca repete de um veículo para o outro. Fora daqui ficam placa, RENAVAM, número de
 * frota, cor e dono — identidade não se herda —, o rodado, que decide qual catálogo lista a marca
 * escolhida, e o papel, que o operador informa antes de chegar aqui.
 *
 * O catálogo FIPE que a API consulta devolve só marca e modelo: tara, capacidade e eixos não
 * existem lá. Quem sabe o peso de um bitrem desta frota é a própria frota.
 */
export const VEHICLE_BRAND_DEFAULT_FIELDS = [
  'acquisitionAmount',
  'annualInsuranceAmount',
  'annualVehicleTaxAmount',
  'averageConsumption',
  'axleCount',
  'bodyType',
  'capacityCubicMeters',
  'capacityKilograms',
  'fuelType',
  'monthlyInstallmentAmount',
  'otherCostsPerKilometer',
  'tareWeightKilograms',
] as const
export type VehicleBrandDefaultField = (typeof VEHICLE_BRAND_DEFAULT_FIELDS)[number]

/** Valor que o rascunho traz sozinho: preencher por cima dele não apaga escolha de ninguém. */
export const VEHICLE_BRAND_DEFAULT_BLANK: Readonly<Record<VehicleBrandDefaultField, string>> = {
  acquisitionAmount: '',
  annualInsuranceAmount: '',
  annualVehicleTaxAmount: '',
  averageConsumption: '',
  axleCount: '0',
  bodyType: '00',
  capacityCubicMeters: '',
  capacityKilograms: '',
  fuelType: DEFAULT_FUEL_PRODUCT,
  monthlyInstallmentAmount: '',
  otherCostsPerKilometer: '',
  tareWeightKilograms: '',
}

const WHITESPACE_PATTERN = /\s+/g

function normalizeBrand(value: string): string {
  return value.trim().toUpperCase().replace(WHITESPACE_PATTERN, ' ')
}

/** O mais recente é o que reflete a prática de hoje: contrato antigo tem preço e seguro de antes. */
function pickMostRecent(vehicles: readonly FleetVehicleDetail[]): FleetVehicleDetail | undefined {
  return vehicles.reduce<FleetVehicleDetail | undefined>(
    (latest, vehicle) =>
      latest === undefined || vehicle.createdAt > latest.createdAt ? vehicle : latest,
    undefined,
  )
}

function findSourceVehicle(
  input: Readonly<{
    brand: string
    model: string
    role: string
    vehicles: readonly FleetVehicleDetail[]
  }>,
): FleetVehicleDetail | undefined {
  const brand = normalizeBrand(input.brand)
  if (brand === '') return undefined

  const sameBrand = input.vehicles.filter(
    (vehicle) => vehicle.role === input.role && normalizeBrand(vehicle.brand) === brand,
  )
  const model = normalizeBrand(input.model)
  const sameModel =
    model === '' ? [] : sameBrand.filter((vehicle) => normalizeBrand(vehicle.model) === model)

  return pickMostRecent(sameModel.length > 0 ? sameModel : sameBrand)
}

/**
 * Repetir marca é repetir ficha técnica: o segundo cavalo Volvo da frota tem a tara, a capacidade
 * e o consumo do primeiro. Só campo ainda em branco é preenchido — o que o operador digitou manda.
 */
export function resolveVehicleBrandDefaults(
  input: Readonly<{
    state: FleetVehicleFormState
    vehicles: readonly FleetVehicleDetail[]
  }>,
): Partial<FleetVehicleFormState> {
  const source = findSourceVehicle({
    brand: input.state.brand,
    model: input.state.model,
    role: input.state.role,
    vehicles: input.vehicles,
  })
  if (source === undefined) return {}

  const sourceState = toVehicleFormState(source)
  const defaults: Record<string, string> = {}
  for (const field of VEHICLE_BRAND_DEFAULT_FIELDS) {
    const current = input.state[field]
    const candidate = sourceState[field]
    if (current !== VEHICLE_BRAND_DEFAULT_BLANK[field]) continue
    if (candidate === VEHICLE_BRAND_DEFAULT_BLANK[field]) continue
    defaults[field] = candidate
  }

  return defaults
}
