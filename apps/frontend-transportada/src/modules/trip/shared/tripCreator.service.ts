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

/** Teto de páginas percorridas só para achar a criação: uma viagem enorme não puxa a história toda. */
export const MAX_PAGES_TO_FIND_CREATOR = 10

/**
 * Percorre a linha do tempo, página a página, até achar `trip.created`. As páginas dependem do
 * cursor da anterior, então a leitura é sequencial por natureza. Não achou, ou sem ator humano,
 * devolve `null`: quem chama só mostra o nome quando há um.
 */
export async function readTripCreatorName(
  readPage: (cursor: null | string) => Promise<TripTimelinePage>,
): Promise<null | string> {
  let cursor: null | string = null

  for (let pageNumber = 0; pageNumber < MAX_PAGES_TO_FIND_CREATOR; pageNumber += 1) {
    const page = await readPage(cursor)
    const creatorName = findTripCreatorName([page])

    if (creatorName !== undefined) return creatorName
    if (page.nextCursor === null) return null
    cursor = page.nextCursor
  }

  return null
}
