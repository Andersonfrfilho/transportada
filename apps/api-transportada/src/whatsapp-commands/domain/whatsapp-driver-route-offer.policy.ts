/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8–RF10, RF12, RNF1: **a oferta da próxima rota** depois da baixa que fecha a parada — o texto,
 * e a regra de quando ela pode pedir resposta. Igual no grupo e na conversa individual.
 */
import {
  formatDirectionsUrl,
  formatNextStep,
  formatNotUnderstood,
  formatReplyHint,
  NOTHING_RECORDED_TEXT,
} from './whatsapp-message-format.policy.js'

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
  declined: `${NOTHING_RECORDED_TEXT}\n${formatNextStep('quando for sair, mande *saí*.')}`,
  options: ['*1* - Seguir para ela 🚚', '*2* - Escolher outra da lista'],
  withoutQuestion: formatNextStep('quando for sair, mande *saí*.'),
  unreliableAddress:
    '⚠️ Este endereço está sem localização certa no mapa. Quando chegar, marque Cheguei e compartilhe a localização: eu atualizo o endereço.',
} as const

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, '')

/** O link do mapa pela coordenada do cadastro da parada (nunca pela do motorista). */
export function buildRouteOfferMapUrl(
  coordinate: NonNullable<RouteOfferStop['coordinate']>,
): string {
  return formatDirectionsUrl({
    latitude: Number(coordinate.latitude),
    longitude: Number(coordinate.longitude),
  })
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

const LOCATION_CLIP_LINE = 'Clipe 📎 → Localização → Enviar localização atual'
const LOCATION_SKIP_HINT = formatReplyHint('Se não puder agora, responda pular.')
const LOCATION_AGAIN_REASON = 'Esta resposta vai por localização.'
const LOCATION_AGAIN_HINT = `${LOCATION_CLIP_LINE}, _ou responda pular._`

type LocationPromptKey =
  | 'ask'
  | 'askAgain'
  | 'askAgainHint'
  | 'askAgainReason'
  | 'askUnreliableAddress'
  | 'gaveUp'

/** Spec 294 RF24: o pedido opcional de localização antes do "Iniciar rota" e do "Cheguei". */
export const LOCATION_PROMPT_TEXT: Readonly<Record<LocationPromptKey, string>> = {
  ask: `📍 *Mande sua localização* para medir a distância até a parada.\n${LOCATION_CLIP_LINE}.\n${LOCATION_SKIP_HINT}`,
  /** Spec 294 RF14: "cheguei" numa parada sem localização certa — o ponto corrige o endereço. */
  askUnreliableAddress: `📍 *Este endereço está sem localização certa no mapa.*\nMande sua localização que eu corrijo o endereço.\n${LOCATION_CLIP_LINE}.\n${LOCATION_SKIP_HINT}`,
  /** Pedido repetido: o item vai por localização, não por áudio nem por texto (o grupo junta motivo e dica). */
  askAgain: `${formatNotUnderstood({ reason: LOCATION_AGAIN_REASON })}\n${LOCATION_AGAIN_HINT}`,
  askAgainHint: LOCATION_AGAIN_HINT,
  askAgainReason: LOCATION_AGAIN_REASON,
  gaveUp:
    'Não recebi a localização nem o "pular", então não registrei.\n➡️ _Próximo passo:_ mande o comando de novo quando for.',
}

/** O pedido de localização do evento; "cheguei" em parada sem localização certa diz que o ponto corrige o endereço. */
export function describeLocationPrompt(input: {
  readonly event: 'arrive' | 'depart'
  readonly isAddressReliable?: boolean | undefined
}): string {
  return input.event === 'arrive' && input.isAddressReliable === false
    ? LOCATION_PROMPT_TEXT.askUnreliableAddress
    : LOCATION_PROMPT_TEXT.ask
}
