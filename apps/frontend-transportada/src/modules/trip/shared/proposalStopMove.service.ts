/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import { reconcileCityOrder } from './assemblyOrder.service'
import { buildProposalStopOrder, type ProposalVehicleView } from './proposalView.service'
import type { StopAddressComponents } from './stopAddressKey.service'
import type { ProposalStop } from './trip.types'

/**
 * Nota → caminhão de destino (spec 112).
 *
 * ⚠️ A parada é identificada pela **nota**, nunca pela chave de endereço: o id da nota vem do
 * servidor, e a chave é recalculada na tela — duas fontes para a mesma identidade divergem caladas.
 */
export type StopMoves = ReadonlyMap<string, string>

export type MoveTarget = Readonly<{
  ceilingKilograms: string
  loadKilograms: string
  plate: null | string
  vehicleId: string
  vehicleLabel: null | string
}>

/** As paradas com os movimentos aplicados: cada uma no caminhão para onde o operador a moveu. */
export function applyStopMoves(
  stops: readonly ProposalStop[],
  moves: StopMoves,
): readonly ProposalStop[] {
  if (moves.size === 0) return stops
  return stops.map((stop) => {
    const target = targetOf(stop, moves)
    return target === undefined || target === stop.vehicleId ? stop : { ...stop, vehicleId: target }
  })
}

/** Os caminhões que os movimentos tocam — quem perdeu a parada e quem a ganhou. */
export function resolveMovedVehicleIds(
  stops: readonly ProposalStop[],
  moves: StopMoves,
): ReadonlySet<string> {
  const touched = new Set<string>()
  for (const stop of stops) {
    const target = targetOf(stop, moves)
    if (target === undefined || target === stop.vehicleId) continue
    if (stop.vehicleId !== null) touched.add(stop.vehicleId)
    touched.add(target)
  }
  return touched
}

/**
 * Para onde a parada pode ir: só caminhão com teto de peso na ficha e sobra para ela.
 *
 * ⚠️ **"Espaço" é peso** (spec 112 D1). Peso é conhecido para todo caminhão proposto; cubagem só é
 * calculada para o que está aberto na tela. E desconhecido não cabe em lugar nenhum: sem teto na
 * ficha, sem peso atual ou sem o peso da parada, o caminhão não é oferecido.
 */
export function resolveMoveTargets(
  input: Readonly<{
    fromVehicleId: string
    stopWeightKilograms: null | string
    views: readonly ProposalVehicleView[]
  }>,
): readonly MoveTarget[] {
  const stopWeight = input.stopWeightKilograms
  if (stopWeight === null) return []
  return input.views.flatMap((view) => {
    if (view.vehicleId === input.fromVehicleId) return []
    if (view.maxPayloadKilograms === null || view.weightKilograms === null) return []
    const load = sumScaledAmounts([view.weightKilograms, stopWeight])
    if (compareScaledAmounts(load, view.maxPayloadKilograms) > 0) return []
    return [
      {
        ceilingKilograms: view.maxPayloadKilograms,
        loadKilograms: load,
        plate: view.plate,
        vehicleId: view.vehicleId,
        vehicleLabel: view.vehicleLabel,
      },
    ]
  })
}

/** O peso da parada. Uma nota sem peso torna o total desconhecido — nunca "o que deu para somar". */
export function sumStopWeight(weights: readonly (null | string)[]): null | string {
  const known = weights.filter((weight): weight is string => weight !== null)
  if (known.length === 0 || known.length !== weights.length) return null
  return sumScaledAmounts(known)
}

/**
 * A ordem que o aceite leva, por caminhão: todo caminhão reordenado **ou que ganhou parada**.
 *
 * ⚠️ O caminhão que só ganhou parada não tinha ordem nenhuma salva, e sem ele aqui o movimento se
 * perdia calado no aceite. A ordem salva é reconciliada com as paradas atuais — parada nova vai para
 * o fim —, que é a mesma regra da API (`orderStopKeys`). Quem só perdeu parada não precisa mandar
 * nada: a API a tira dele quando outro caminhão a reivindica.
 */
export function resolveAcceptedStopOrders(
  input: Readonly<{
    addressById: ReadonlyMap<string, StopAddressComponents>
    manualOrderByVehicle: ReadonlyMap<string, readonly string[]>
    moves: StopMoves
    stops: readonly ProposalStop[]
  }>,
): readonly Readonly<{ orderedAddressKeys: readonly string[]; vehicleId: string }>[] {
  const moved = applyStopMoves(input.stops, input.moves)
  const gained = input.stops.flatMap((stop) => {
    const target = targetOf(stop, input.moves)
    return target === undefined || target === stop.vehicleId ? [] : [target]
  })
  const vehicleIds = new Set([...input.manualOrderByVehicle.keys(), ...gained])

  return [...vehicleIds].flatMap((vehicleId) => {
    const proposedOrder = buildProposalStopOrder({
      documentsById: input.addressById,
      stops: moved.filter((stop) => stop.vehicleId === vehicleId),
    })
    const orderedAddressKeys = reconcileCityOrder({
      cityCodes: proposedOrder,
      order: input.manualOrderByVehicle.get(vehicleId) ?? [],
    })
    return orderedAddressKeys.length === 0 ? [] : [{ orderedAddressKeys, vehicleId }]
  })
}

function targetOf(stop: ProposalStop, moves: StopMoves): string | undefined {
  return stop.nfeDocumentIds.map((id) => moves.get(id)).find((vehicleId) => vehicleId !== undefined)
}
