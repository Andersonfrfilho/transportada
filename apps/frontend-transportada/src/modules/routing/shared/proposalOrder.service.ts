/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T024: reordenar as paradas **da proposta**, antes de aceitar.
 *
 * ⚠️ Não confundir com o arraste de `TripStopList`, que reordena a **viagem** por
 * `PATCH /trips/:id/stops/order`. Aqui não há viagem: a proposta ainda é proposta, e a ordem só
 * vira escrita quando alguém a aceita.
 */

export type ProposedStop = Readonly<{ addressKey: string; sequence: number }>

/**
 * A sequência é **renumerada**, não embaralhada junto: ela é a posição no roteiro, e mantê-la
 * grudada na parada faria a lista dizer "1, 3, 2" depois de um arraste.
 *
 * Índice fora da lista devolve a ordem intacta — o arraste que termina fora da área é o caso comum
 * no celular, e ele não pode produzir uma ordem que ninguém pediu.
 */
export function reorderProposedStops<TStop extends ProposedStop>(input: {
  readonly from: number
  readonly stops: readonly TStop[]
  readonly to: number
}): readonly TStop[] {
  const { from, stops, to } = input
  if (from < 0 || to < 0 || from >= stops.length || to >= stops.length || from === to) {
    return [...stops]
  }

  const reordered = [...stops]
  const [moved] = reordered.splice(from, 1)
  if (moved === undefined) return [...stops]
  reordered.splice(to, 0, moved)

  return reordered.map((stop, index) => ({ ...stop, sequence: index + 1 }))
}

/** A ordem mudou quando alguma parada deixou de estar na posição em que o solver a pôs. */
export function isProposalReordered(input: {
  readonly original: readonly ProposedStop[]
  readonly current: readonly ProposedStop[]
}): boolean {
  return input.current.some((stop, index) => input.original[index]?.addressKey !== stop.addressKey)
}
