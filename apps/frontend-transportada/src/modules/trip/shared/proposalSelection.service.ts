/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

/**
 * Spec 110 D5: **aceitar tudo, ou só o que serve.**
 *
 * Antes desta spec o aceite era um botão só: uma viagem com o caminhão errado obrigava a descartar
 * as quatro e refazer o pedido inteiro — e a spec 108 tinha acabado de tornar a revisão possível
 * justamente para isso não acontecer.
 *
 * ⚠️ **Serviço puro.** A seleção é estado da tela, e a conta que ela produz é o que decide a viagem:
 * misturar as duas coisas num componente faria a regra só existir enquanto alguém a olhasse.
 */
export type ProposalSelectionVehicle = Readonly<{
  deliveries: number
  distanceMeters: null | number
  durationSeconds: null | number
  hasGaps: boolean
  /** `null` é praça sem tarifa conhecida — e ela contamina o total, nunca entra como zero. */
  tollAmount: null | string
  /** ⚠️ `null` é a conta que não veio — e ela contamina o total, nunca entra como zero. */
  totalCost: null | string
  totalMargin: null | string
  totalRevenue: null | string
  vehicleId: string
}>

export type ProposalSelectionSummary = Readonly<{
  allSelected: boolean
  deliveries: number
  hasGaps: boolean
  indeterminate: boolean
  /** O que volta para o maço: nada foi criado para elas, então nada há a desfazer. */
  releasedDeliveries: number
  releasedTrips: number
  selectedCount: number
  totalCost: null | string
  totalCount: number
  totalDistanceMeters: null | number
  totalDurationSeconds: null | number
  totalMargin: null | string
  totalRevenue: null | string
  totalToll: null | string
}>

/**
 * Soma que **desiste** quando uma parcela é desconhecida.
 *
 * ⚠️ O pior caso vence, como no peso estimado da ADR-0052: um veículo sem rodagem conhecida torna a
 * rodagem do conjunto desconhecida. Somar só os que se sabe produziria um número menor com cara de
 * completo, e é com ele que alguém decidiria.
 */
function sumOrUnknown(values: readonly (null | number)[]): null | number {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

/**
 * ⚠️ **Uma parcela desconhecida torna o total desconhecido**, e nada marcado também: somar o que se
 * sabe daria um número menor com cara de completo, e `R$ 0,00` diria que a distribuição não custa
 * nada. É a mesma regra da rodagem, e a mesma do peso estimado (ADR-0052).
 */
function sumOrAbsent(values: readonly (null | string)[]): null | string {
  /**
   * ⚠️ Nada marcado soma **zero**, e viagem com conta ausente torna o total ausente. As duas coisas
   * são diferentes: a primeira é o que o operador escolheu, a segunda é o que ninguém sabe — e
   * somar como se a ausente fosse zero apresentaria um total menor que o real.
   */
  if (values.some((value) => value === null)) return null
  return sumScaledAmounts(values.flatMap((value) => (value === null ? [] : [value])))
}

export function summarizeProposalSelection(
  input: Readonly<{
    selected: ReadonlySet<string>
    vehicles: readonly ProposalSelectionVehicle[]
  }>,
): ProposalSelectionSummary {
  const chosen = input.vehicles.filter((vehicle) => input.selected.has(vehicle.vehicleId))
  const left = input.vehicles.filter((vehicle) => !input.selected.has(vehicle.vehicleId))
  const tolls = chosen.map((vehicle) => vehicle.tollAmount)

  return {
    allSelected: chosen.length > 0 && chosen.length === input.vehicles.length,
    deliveries: chosen.reduce((total, vehicle) => total + vehicle.deliveries, 0),
    /** ⚠️ A marca é da **seleção**: desmarcar a viagem incompleta tira a marca do conjunto. */
    hasGaps: chosen.some((vehicle) => vehicle.hasGaps),
    indeterminate: chosen.length > 0 && chosen.length < input.vehicles.length,
    releasedDeliveries: left.reduce((total, vehicle) => total + vehicle.deliveries, 0),
    releasedTrips: left.length,
    selectedCount: chosen.length,
    totalCost: sumOrAbsent(chosen.map((vehicle) => vehicle.totalCost)),
    totalCount: input.vehicles.length,
    totalDistanceMeters: sumOrUnknown(chosen.map((vehicle) => vehicle.distanceMeters)),
    totalDurationSeconds: sumOrUnknown(chosen.map((vehicle) => vehicle.durationSeconds)),
    totalMargin: sumOrAbsent(chosen.map((vehicle) => vehicle.totalMargin)),
    totalRevenue: sumOrAbsent(chosen.map((vehicle) => vehicle.totalRevenue)),
    totalToll: sumOrAbsent(tolls),
  }
}

export function toggleProposalSelection(
  input: Readonly<{ selected: ReadonlySet<string>; vehicleId: string }>,
): ReadonlySet<string> {
  const next = new Set(input.selected)
  if (!next.delete(input.vehicleId)) next.add(input.vehicleId)

  return next
}

/** Alterna: quem marcou tudo por engano desfaz num clique, não em quatro. */
export function toggleAllProposalSelection(
  input: Readonly<{
    selected: ReadonlySet<string>
    /** Só os ids: alternar tudo não olha número nenhum, e pedir a conta inteira seria pedir demais. */
    vehicles: readonly Readonly<{ vehicleId: string }>[]
  }>,
): ReadonlySet<string> {
  const every =
    input.vehicles.length > 0 &&
    input.vehicles.every((vehicle) => input.selected.has(vehicle.vehicleId))

  return every ? new Set() : new Set(input.vehicles.map((vehicle) => vehicle.vehicleId))
}
