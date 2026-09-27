/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildTripOccurrenceRoute } from './tripOccurrenceRoute.service'

/**
 * Spec 180 RF15/RF18 (CA13): o evento leva à coisa — nota vira link para a nota, parada para a
 * parada. O app não tem router (`main.tsx` decide a página por `pushState`/`popstate`) e nem nota
 * nem parada têm rota própria — as duas só existem como linhas dentro do detalhe da viagem
 * (`/trips/:tripId`, via `TripStopList`). O link é então uma âncora de página (`href="#id"`): zero
 * requisição (RF18), funciona sem JavaScript de navegação e não conflita com o roteamento manual do
 * shell, que só olha `pathname`/`search` — o fragmento não dispara `popstate`.
 *
 * `TripStopList` marca o alvo com o mesmo id (`data-revealed-panel` inclui a folga de rolagem que
 * `src/styles/index.css` já declara para painel revelado).
 */
export function buildTripTimelineDocumentAnchorId(documentId: string): string {
  return `trip-timeline-document-${documentId}`
}

export function buildTripTimelineStopAnchorId(stopId: string): string {
  return `trip-timeline-stop-${stopId}`
}

export function resolveTripTimelineDocumentHref(documentId: string): string {
  return `#${buildTripTimelineDocumentAnchorId(documentId)}`
}

export function resolveTripTimelineStopHref(stopId: string): string {
  return `#${buildTripTimelineStopAnchorId(stopId)}`
}

/**
 * Spec 183 T204 (180 RF15): a ocorrência ganhou página própria — o evento leva a ela, não a uma
 * âncora do detalhe da viagem.
 */
export function resolveTripTimelineOccurrenceHref(occurrenceId: string): string {
  return buildTripOccurrenceRoute(occurrenceId)
}
