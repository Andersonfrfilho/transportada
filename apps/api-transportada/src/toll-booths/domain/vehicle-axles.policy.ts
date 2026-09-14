/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quantos eixos o veículo tem, e de onde o número veio (spec 090 D2).
 *
 * A ficha vence sempre; a referência é piso. `axle_count` é zero por padrão e está assim em **8 de
 * 12** veículos da base real, então sem a referência a maior parte da frota não teria pedágio
 * nenhum calculado — e "R$ 0,00" é pior que "R$ 65,60 estimado", porque o primeiro não avisa nada.
 */
import { VEHICLE_TYPES, type VehicleType } from '../../shared/vehicle-type.constant.js'
import type { AxleCount } from './toll-route-cost.policy.js'

const VEHICLE_TYPE_SET = new Set<string>(VEHICLE_TYPES)

/**
 * O piso por tipo, **não** uma tabela no banco.
 *
 * ⚠️ A spec pedia tabela de mercado sem `company_id`, como `fuel_price_references`. Aqui isso não
 * paga: aquela é carregada toda semana de uma publicação externa que muda, e esta é um mapa de dez
 * linhas que ninguém atualiza fora do código — tabela custaria migration, seed, repositório e mais
 * uma exceção declarada no contrato de isolamento, por dado que nasce e morre neste arquivo. Segue
 * o molde de `VEHICLE_TYPES` e `FUEL_TYPES`, que são catálogo pelo mesmo motivo.
 *
 * ⚠️ `toco` é caminhão de **dois** eixos e `truck` (truncado) é de três — a abertura do `spec.md`
 * dizia "toco de 3 eixos" e estava errada; foi corrigida junto com esta task.
 *
 * `tractor_unit` conta **o conjunto que roda**, cavalo mais semirreboque: o cavalo sozinho não
 * atravessa praça carregado, e a praça cobra o que passa pela cancela.
 */
const AXLES_BY_VEHICLE_TYPE: Readonly<Record<VehicleType, number>> = {
  car: 2,
  motorcycle: 2,
  /** Sem tipo conhecido, o piso é o menor caminhão: superestimar inventa custo que não existe. */
  other: 2,
  three_quarter: 2,
  toco: 2,
  tractor_unit: 5,
  truck: 3,
  utility: 2,
  van: 2,
  vuc: 2,
}

export type ResolveVehicleAxlesParams = {
  readonly axleCount: number
  readonly vehicleType: VehicleType
}

export function resolveVehicleAxles(input: ResolveVehicleAxlesParams): AxleCount {
  if (input.axleCount > 0) return { count: input.axleCount, source: 'declared' }

  return { count: AXLES_BY_VEHICLE_TYPE[input.vehicleType], source: 'estimated' }
}

/**
 * A mesma resolução acima, para a coluna crua da ficha — onde `vehicleType` é `VehicleType | ''`
 * (implemento, ou cadastro incompleto). Declarado vence **mesmo** sem tipo válido: quem já contou
 * os eixos não precisa do catálogo. Sem os dois, `null` é "não sei", nunca dois eixos por padrão —
 * ver `read-route-geometry.use-case.ts` e `trip-valuation.query.ts` (spec 090 T7/T9).
 */
export function resolveDeclaredVehicleAxles(input: {
  readonly axleCount: number
  readonly vehicleType: string
}): AxleCount | null {
  if (input.axleCount > 0) return { count: input.axleCount, source: 'declared' }
  if (!VEHICLE_TYPE_SET.has(input.vehicleType)) return null

  return resolveVehicleAxles({
    axleCount: input.axleCount,
    vehicleType: input.vehicleType as VehicleType,
  })
}
