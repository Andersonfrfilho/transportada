/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripTimelinePage } from './trip.types'

/**
 * Quem criou a viagem, lido do evento `trip.created` da linha do tempo — a viagem não guarda o
 * autor em coluna própria. `undefined` é "o evento ainda não foi carregado" (a linha do tempo é
 * paginada e a criação é o item mais antigo); `null` é criada sem ator humano (semeada/importada).
 */
export function findTripCreatorName(pages: readonly TripTimelinePage[]): null | string | undefined {
  for (const page of pages) {
    const created = page.items.find((item) => item.kind === 'trip.created')

    if (created !== undefined) return created.actorName
  }

  return undefined
}
