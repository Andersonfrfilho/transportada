/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CoverableSuggestionStop } from './suggestionLeftover.service'

/**
 * Spec 108: **a proposta antes do rascunho.** A distribuição multi-veículo criava as viagens no
 * mesmo clique que pedia o roteiro — o operador lia "5 viagens criadas" sem nunca ter visto o que
 * ia aceitar, e desfazer era cancelar cinco viagens uma a uma.
 *
 * ⚠️ O que existe no banco neste ponto é a **sugestão** (paradas propostas), nunca viagem: nem
 * rascunho, nem vínculo de nota, nem parada de viagem. Quem cria é o aceite, e só ele.
 */
export type ProposalVehicle = Readonly<{
  documentCount: number
  /** Os nomes das paradas na ordem proposta — é o roteiro que o operador confere antes de aceitar. */
  stopLabels: readonly string[]
  /** `null` é placa que a frota carregada não nomeia — a linha continua, sem ela. */
  plate: null | string
  stopCount: number
  vehicleId: string
}>

/**
 * ⚠️ A nota é contada **uma vez por veículo**: a mesma nota em duas paradas do mesmo caminhão é uma
 * entrega, e somar as listas cruas inflaria o número que o operador usa para decidir.
 *
 * ⚠️ Parada sem veículo **não entra** — ela é sobra, e a sobra tem painel próprio com a causa de
 * cada uma. Contá-la aqui a faria parecer distribuída.
 */
export function resolveProposalVehicles(
  input: Readonly<{
    plateByVehicleId: ReadonlyMap<string, string>
    stops: readonly CoverableSuggestionStop[]
  }>,
): readonly ProposalVehicle[] {
  const byVehicle = new Map<string, { documentIds: Set<string>; stopLabels: string[] }>()

  for (const stop of input.stops) {
    if (stop.vehicleId === null) continue
    const current = byVehicle.get(stop.vehicleId) ?? {
      documentIds: new Set<string>(),
      stopLabels: [],
    }
    current.stopLabels.push(stop.label)
    for (const documentId of stop.nfeDocumentIds) current.documentIds.add(documentId)
    byVehicle.set(stop.vehicleId, current)
  }

  return [...byVehicle.entries()].map(([vehicleId, group]) => ({
    documentCount: group.documentIds.size,
    plate: input.plateByVehicleId.get(vehicleId) ?? null,
    stopCount: group.stopLabels.length,
    stopLabels: group.stopLabels,
    vehicleId,
  }))
}
