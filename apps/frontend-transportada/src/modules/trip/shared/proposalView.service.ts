/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import type { VehicleType } from '@/modules/shared/vehicleType.constant'
import type { SuggestionValuation } from '@/modules/routing/shared/suggestionValuation.service'

import type { ProposalStop } from './trip.types'

/**
 * Spec 110 D2: **uma linha por viagem proposta**, e o que ela precisa dizer sem ser aberta.
 *
 * ⚠️ Puro, e é ele que junta as três origens que a tela tem em mãos: as paradas da proposta, a conta
 * da spec 101 e a frota já carregada. Fazer essa junção dentro do componente a esconderia de
 * qualquer teste — e é ela que decide o que o operador compara.
 */
export type ProposalDocumentWeight = Readonly<{
  cargoGrossWeight: null | string
  cargoWeightSource: 'estimated' | 'xml' | null
}>

export type ProposalVehicleView = Readonly<{
  cities: readonly string[]
  deliveries: number
  distanceMeters: null | number
  driverName: null | string
  durationSeconds: null | number
  hasGaps: boolean
  plate: null | string
  stops: readonly ProposalStop[]
  /**
   * ⚠️ **`null` é a conta que não veio, nunca zero.** Sem `trip.financials` — ou com a consulta em
   * erro — `R$ 0,00` afirmaria que a viagem não rende nada e não custa nada, que é o número que faz
   * alguém aceitar a distribuição errada. É a mesma regra da ocupação e do peso: ausência é dita.
   */
  totalCost: null | string
  totalMargin: null | string
  marginPercentage: null | string
  totalRevenue: null | string
  vehicleId: string
  vehicleLabel: null | string
  vehicleType: '' | VehicleType
  /** `null` quando nenhuma nota do veículo declara massa — ausência, nunca zero (ADR-0052). */
  weightKilograms: null | string
  /** ⚠️ **Uma nota estimada marca o veículo inteiro**: é a marca que o conferente lê antes de aceitar. */
  weightEstimated: boolean
}>

export function buildProposalVehicleViews(
  input: Readonly<{
    documentsById: ReadonlyMap<string, ProposalDocumentWeight>
    /** O par veículo→motorista que a montagem enviou: é ele que decide quem dirige. */
    driverIdByVehicleId: ReadonlyMap<string, string>
    driverNameById: ReadonlyMap<string, string>
    stops: readonly ProposalStop[]
    valuation: null | SuggestionValuation
    vehicleById: ReadonlyMap<
      string,
      Readonly<{ label: string; plate: string; type: '' | VehicleType }>
    >
  }>,
): readonly ProposalVehicleView[] {
  const grouped = new Map<string, { documentIds: Set<string>; stops: ProposalStop[] }>()

  for (const stop of input.stops) {
    /** Parada sem veículo é **sobra**, e sobra tem painel próprio: contá-la aqui a faria parecer distribuída. */
    if (stop.vehicleId === null) continue
    const current = grouped.get(stop.vehicleId) ?? { documentIds: new Set<string>(), stops: [] }
    current.stops.push(stop)
    for (const documentId of stop.nfeDocumentIds) current.documentIds.add(documentId)
    grouped.set(stop.vehicleId, current)
  }

  const valuationByVehicle = new Map(
    (input.valuation?.vehicles ?? []).map((entry) => [entry.vehicleId, entry]),
  )

  return [...grouped.entries()].map(([vehicleId, group]) => {
    const vehicle = input.vehicleById.get(vehicleId)
    const entry = valuationByVehicle.get(vehicleId)
    const weights = [...group.documentIds].map((documentId) => input.documentsById.get(documentId))
    const declared = weights.flatMap((weight) =>
      weight?.cargoGrossWeight === null || weight?.cargoGrossWeight === undefined
        ? []
        : [weight.cargoGrossWeight],
    )

    return {
      /** As cidades **na ordem do roteiro**, sem repetir: elas são o subtítulo da linha. */
      cities: [...new Set(group.stops.map((stop) => stop.label).filter((label) => label !== ''))],
      deliveries: group.documentIds.size,
      distanceMeters: entry?.distanceMeters ?? null,
      driverName: resolveDriverName({
        driverIdByVehicleId: input.driverIdByVehicleId,
        driverNameById: input.driverNameById,
        fallbackDriverId: entry?.driverId ?? null,
        vehicleId,
      }),
      durationSeconds: entry?.durationSeconds ?? null,
      hasGaps: entry?.valuation.hasGaps ?? false,
      marginPercentage: entry?.valuation.marginPercentage ?? null,
      plate: vehicle?.plate ?? null,
      stops: group.stops,
      totalCost: entry?.valuation.totalCost ?? null,
      totalMargin: entry?.valuation.totalMargin ?? null,
      totalRevenue: entry?.valuation.totalRevenue ?? null,
      vehicleId,
      vehicleLabel: vehicle?.label ?? null,
      vehicleType: vehicle?.type ?? '',
      weightEstimated: weights.some((weight) => weight?.cargoWeightSource === 'estimated'),
      weightKilograms: declared.length === 0 ? null : sumScaledAmounts(declared),
    }
  })
}

function resolveDriverName(
  input: Readonly<{
    driverIdByVehicleId: ReadonlyMap<string, string>
    driverNameById: ReadonlyMap<string, string>
    /** A conta também sabe o motorista; ela é a segunda opinião, não a primeira. */
    fallbackDriverId: null | string
    vehicleId: string
  }>,
): null | string {
  const driverId = input.driverIdByVehicleId.get(input.vehicleId) ?? input.fallbackDriverId
  return driverId === null ? null : (input.driverNameById.get(driverId) ?? null)
}

/**
 * ⚠️ **Acima de quatro cidades, o resto vira contagem** (D2).
 *
 * Sem o corte a linha de uma viagem com dezessete destinos ocupa três alturas de texto, empurra as
 * seis colunas de número para fora do alinhamento e a comparação entre viagens — que é a tela
 * inteira — deixa de existir. Medido em produção: um caminhão com 45 entregas cobria 17 cidades.
 */
export const PROPOSAL_CITY_LIMIT = 4

export function summarizeProposalCities(
  cities: readonly string[],
): Readonly<{ hidden: number; shown: readonly string[] }> {
  return {
    hidden: Math.max(0, cities.length - PROPOSAL_CITY_LIMIT),
    shown: cities.slice(0, PROPOSAL_CITY_LIMIT),
  }
}
