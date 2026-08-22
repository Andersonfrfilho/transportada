/* Copyright (c) 2026 Ada Technology. MIT License. */
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant'

/**
 * "Flex" e "Híbrido" são leitura do par de combustíveis, não coluna do banco: o operador escolhe
 * dois produtos e é a tela que sabe o nome disso. Chamar de híbrido o par com energia de um dos
 * lados é o vocabulário de quem compra caminhão — o resto é flex.
 */
export const FUEL_ARRANGEMENTS = ['flex', 'hybrid', 'single'] as const

export type FuelArrangement = (typeof FUEL_ARRANGEMENTS)[number]

type FuelArrangementInput = Readonly<{
  fuelType: FuelProduct
  secondaryFuelType: '' | FuelProduct
}>

type SecondaryFuelState = FuelArrangementInput & Readonly<{ secondaryAverageConsumption: string }>

const ELECTRIC_PRODUCT: FuelProduct = 'eletrico'

export function resolveFuelArrangement(input: FuelArrangementInput): FuelArrangement {
  if (input.secondaryFuelType === '') return 'single'
  if (input.fuelType === ELECTRIC_PRODUCT || input.secondaryFuelType === ELECTRIC_PRODUCT) {
    return 'hybrid'
  }
  return 'flex'
}

/**
 * Tanque único é nomeado pelo próprio produto — um veículo elétrico é "Elétrico", e um
 * `fuelArrangement.single` diria "Um combustível" numa coluna já chamada Combustível.
 */
export function resolveFuelArrangementLabelKey(input: FuelArrangementInput): string {
  const arrangement = resolveFuelArrangement(input)
  if (arrangement === 'single') return `fuelOption.${input.fuelType}`
  return `fuelArrangement.${arrangement}`
}

export function listSecondaryFuelOptions(primary: FuelProduct): readonly FuelProduct[] {
  return FUEL_PRODUCTS.filter((candidate) => candidate !== primary)
}

/**
 * As duas metades do CHECK do banco, ditas no formulário antes do 400: consumo de tanque que não
 * existe, e produto repetido nos dois tanques — que não é flex, é o mesmo combustível contado duas
 * vezes, e entraria na média do R$/km como se fossem dois. Lê só o estado resolvido, sem o
 * anterior, para ser idempotente: aplicar duas vezes dá o mesmo campo limpo.
 */
export function resolveSecondaryFuelDefaults(
  state: SecondaryFuelState,
): Readonly<Partial<SecondaryFuelState>> {
  if (state.secondaryFuelType === state.fuelType) {
    return { secondaryAverageConsumption: '', secondaryFuelType: '' }
  }
  if (state.secondaryFuelType === '' && state.secondaryAverageConsumption !== '') {
    return { secondaryAverageConsumption: '' }
  }
  return {}
}
