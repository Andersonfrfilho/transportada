/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T11 — **qual parada o "saí" e o "cheguei" do WhatsApp miram**, para o grupo e para a
 * conversa individual decidirem igual. Regra pura sobre a viagem já lida (`findCurrentDriverTrip`);
 * quem grava e recusa de verdade é a função do app (`reportStopDeparture`/`reportStopArrival`).
 *
 * - **Saí**: com uma parada já a caminho, o app recusa sair para outra (`TRIP_HAS_STOP_EN_ROUTE`) —
 *   a resposta é `en_route`, para o bot dizer qual. Senão, as candidatas são as paradas que ainda
 *   não saíram, não chegaram e não fecharam, na ordem do roteiro.
 * - **Cheguei**: a parada a caminho é a resposta. Sem nenhuma a caminho, as que ainda não chegaram
 *   nem fecharam, na ordem do roteiro.
 * - Uma candidata só: `single` (o bot registra direto). Mais de uma: `choose`, com a primeira do
 *   roteiro em `suggested`. Nenhuma: `none`.
 *
 * A parada é apresentada pelo número da primeira nota e pelo nome do cliente (`describeStopReference`,
 * spec 294 RF17): o grupo do motorista mostra o cliente.
 */

export type WhatsAppStopCandidate = {
  readonly arrivedAt: string | null
  readonly completedAt: string | null
  readonly documents: readonly {
    readonly number: string
    readonly recipientName?: string | undefined
    readonly separationStatus: string
  }[]
  readonly enRouteSince: string | null
  readonly id: string
  readonly sequence: number
}

export type WhatsAppStopResolution<Stop extends WhatsAppStopCandidate> =
  | { readonly kind: 'single'; readonly stop: Stop }
  | { readonly kind: 'choose'; readonly stops: readonly Stop[]; readonly suggested: Stop }
  /** Só no "saí": a parada que já está a caminho (o app recusaria outra). */
  | { readonly kind: 'en_route'; readonly stop: Stop }
  | { readonly kind: 'none' }

const CLOSED_DOCUMENT = new Set(['delivered', 'returned'])

function isEnRoute(stop: WhatsAppStopCandidate): boolean {
  return stop.enRouteSince !== null && stop.arrivedAt === null && stop.completedAt === null
}

function isPending(stop: WhatsAppStopCandidate): boolean {
  return (
    stop.completedAt === null &&
    stop.arrivedAt === null &&
    stop.documents.some((document) => !CLOSED_DOCUMENT.has(document.separationStatus))
  )
}

function bySequence<Stop extends WhatsAppStopCandidate>(stops: readonly Stop[]): Stop[] {
  return [...stops].sort((left, right) => left.sequence - right.sequence)
}

function toResolution<Stop extends WhatsAppStopCandidate>(
  candidates: readonly Stop[],
): WhatsAppStopResolution<Stop> {
  const [first] = candidates
  if (first === undefined) return { kind: 'none' }
  if (candidates.length === 1) return { kind: 'single', stop: first }
  return { kind: 'choose', stops: candidates, suggested: first }
}

export function resolveDepartureStop<Stop extends WhatsAppStopCandidate>(
  stops: readonly Stop[],
): WhatsAppStopResolution<Stop> {
  const enRoute = stops.find(isEnRoute)
  if (enRoute !== undefined) return { kind: 'en_route', stop: enRoute }
  return toResolution(bySequence(stops.filter(isPending)))
}

export function resolveArrivalStop<Stop extends WhatsAppStopCandidate>(
  stops: readonly Stop[],
): WhatsAppStopResolution<Stop> {
  const enRoute = bySequence(stops.filter(isEnRoute))
  if (enRoute.length > 0) return toResolution(enRoute)
  return toResolution(bySequence(stops.filter(isPending)))
}

/** "NF 17234 · Padaria Sol e mais 2": a nota, o cliente e quantas outras vão junto. */
export function describeStopReference(stop: WhatsAppStopCandidate): string {
  const [first, ...rest] = stop.documents
  if (first === undefined) return `parada ${stop.sequence}`
  const name = first.recipientName?.trim()
  const reference = name ? `NF ${first.number} · ${name}` : `NF ${first.number}`
  return rest.length === 0 ? reference : `${reference} e mais ${rest.length}`
}
