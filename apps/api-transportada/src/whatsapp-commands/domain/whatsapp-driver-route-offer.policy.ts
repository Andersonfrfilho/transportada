/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8–RF10, RF12, RNF1: **a oferta da próxima rota** depois da baixa que fecha a parada — o texto,
 * e a regra de quando ela pode pedir resposta. Igual no grupo e na conversa individual.
 */

/** A próxima parada como a baixa da API a devolve (`DriverNextStop`), só o que a oferta mostra. */
export type RouteOfferStop = {
  readonly address: string
  readonly coordinate: { readonly latitude: string; readonly longitude: string } | null
  readonly documents: readonly { readonly id: string; readonly number: string }[]
  readonly id: string
  readonly isAddressReliable: boolean
  readonly recipientName: string
  readonly sequence: number
  readonly totalStops: number
}

export const ROUTE_OFFER_TEXT = {
  declined: 'Certo, não registrei nada.\n➡️ _Próximo passo:_ quando for sair, mande *saí*.',
  options: ['*1* - Seguir para ela 🚚', '*2* - Escolher outra da lista'],
  routeCompleted: '🏁 *Rota concluída:* todas as paradas fechadas.',
  withoutQuestion: '➡️ _Próximo passo:_ quando for sair, mande *saí*.',
  unreliableAddress:
    '⚠️ Este endereço está sem localização certa no mapa. Quando chegar, marque Cheguei e compartilhe a localização: eu atualizo o endereço.',
} as const

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, '')

/** O link do mapa pela coordenada do cadastro da parada (nunca pela do motorista). */
export function buildRouteOfferMapUrl(
  coordinate: NonNullable<RouteOfferStop['coordinate']>,
): string {
  return `https://www.google.com/maps/search/?api=1&query=${coordinate.latitude},${coordinate.longitude}`
}

/** "Parada 2 de 5 — Padaria Sol", endereço, notas, mapa e o aviso de endereço não confiável. */
export function describeRouteOfferStop(stop: RouteOfferStop): string {
  const notes = stop.documents.map((document) => `NF ${stripZeros(document.number)}`).join(', ')
  return [
    `➡️ Próxima parada: ${stop.sequence} de ${stop.totalStops}${stop.recipientName === '' ? '' : ` — ${stop.recipientName}`}`,
    ...(stop.address === '' ? [] : [`📍 ${stop.address}`]),
    ...(notes === '' ? [] : [`🧾 ${notes}`]),
    ...(stop.coordinate === null ? [] : [`🗺️ ${buildRouteOfferMapUrl(stop.coordinate)}`]),
    ...(stop.isAddressReliable ? [] : [ROUTE_OFFER_TEXT.unreliableAddress]),
  ].join('\n')
}

/** A oferta com a pergunta "1 - Sim / 2 - Agora não", ou sem ela quando outro pedido está aberto. */
export function describeRouteOffer(
  stop: RouteOfferStop,
  input: { readonly asks: boolean },
): string {
  return [
    describeRouteOfferStop(stop),
    ...(input.asks ? ['', ...ROUTE_OFFER_TEXT.options] : ['', ROUTE_OFFER_TEXT.withoutQuestion]),
  ].join('\n')
}

/** Spec 294 RF24: o pedido opcional de localização antes do "Iniciar rota" e do "Cheguei". */
export const LOCATION_PROMPT_TEXT = {
  ask: '📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_',
  /** Spec 294 RF14: "cheguei" numa parada sem localização certa — o ponto corrige o endereço. */
  askUnreliableAddress:
    '📍 Este endereço está sem localização certa no mapa. *Mande sua localização* pelo clipe 📎 que eu atualizo o endereço _ou responda pular_',
  /** Pedido repetido: o item vai por localização, não por áudio nem por texto. */
  askAgain:
    'Esse item vai por localização: toque no clipe 📎 → Localização → Enviar localização atual _ou responda pular_.',
  gaveUp:
    'Não recebi a localização nem o "pular", então não registrei.\n➡️ _Próximo passo:_ mande o comando de novo quando for.',
} as const
