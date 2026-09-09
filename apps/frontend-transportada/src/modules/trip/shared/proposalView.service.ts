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
  totalCost: string
  totalMargin: string
  marginPercentage: null | string
  totalRevenue: string
  vehicleId: string
  vehicleLabel: null | string
  vehicleType: '' | VehicleType
  /** `null` quando nenhuma nota do veículo declara massa — ausência, nunca zero (ADR-0052). */
  weightKilograms: null | string
  /** ⚠️ **Uma nota estimada marca o veículo inteiro**: é a marca que o conferente lê antes de aceitar. */
  weightEstimated: boolean
}>

const ZERO = '0.00'

export function buildProposalVehicleViews(
  input: Readonly<{
    documentsById: ReadonlyMap<string, ProposalDocumentWeight>
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
      driverName:
        entry?.driverId === undefined || entry.driverId === null
          ? null
          : (input.driverNameById.get(entry.driverId) ?? null),
      durationSeconds: entry?.durationSeconds ?? null,
      hasGaps: entry?.valuation.hasGaps ?? false,
      marginPercentage: entry?.valuation.marginPercentage ?? null,
      plate: vehicle?.plate ?? null,
      stops: group.stops,
      totalCost: entry?.valuation.totalCost ?? ZERO,
      totalMargin: entry?.valuation.totalMargin ?? ZERO,
      totalRevenue: entry?.valuation.totalRevenue ?? ZERO,
      vehicleId,
      vehicleLabel: vehicle?.label ?? null,
      vehicleType: vehicle?.type ?? '',
      weightEstimated: weights.some((weight) => weight?.cargoWeightSource === 'estimated'),
      weightKilograms: declared.length === 0 ? null : sumScaledAmounts(declared),
    }
  })
}
