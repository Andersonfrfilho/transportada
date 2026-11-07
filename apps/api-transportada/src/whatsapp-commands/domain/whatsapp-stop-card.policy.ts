/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * **O bloco da parada** que o bot mostra ao motorista em cada passo da rota (saída, chegada, evento repetido,
 * oferta da próxima rota), igual no grupo e na conversa individual: notas, valor, cliente, contratante, endereço,
 * mapa, volumes e — só quando o motorista compartilhou um ponto nesta viagem — distância e chegada prevista pela
 * estrada. O grupo mostra cliente e endereço (spec 294 RF17).
 *
 * Dinheiro é texto decimal somado em centavos (`bigint`), nunca float. O dado de terceiro perde os marcadores do
 * WhatsApp (`*`, `_`, `~`, `` ` ``): um nome com asterisco não pode abrir um negrito que ninguém fecha.
 */
import { formatGroupMoney } from '../../whatsapp/application/whatsapp-group-occurrence-flow.service.js'
import { buildRouteOfferMapUrl } from './whatsapp-driver-route-offer.policy.js'

const BOT_TIME_ZONE = 'America/Sao_Paulo'

export type StopCard = {
  readonly address: string
  readonly city: string
  readonly contractorName: string
  readonly coordinate: { readonly latitude: string; readonly longitude: string } | null
  readonly documentNumbers: readonly string[]
  readonly isAddressReliable: boolean
  readonly recipientName: string
  readonly sequence: number
  readonly stopId: string
  readonly totalStops: number
  /** Soma das notas em texto decimal ("1234.56"); `null` quando nenhuma nota tem valor. */
  readonly totalValue: string | null
  /** Volumes das notas; `null` quando não se sabe (a linha some). */
  readonly volumes: number | null
}

/** A estrada do último ponto do motorista até a parada (OSRM). */
export type StopCardEta = {
  readonly distanceMetres: number
  readonly durationSeconds: number
}

export const STOP_CARD_TEXT = {
  unreliableAddress:
    '⚠️ _Este endereço está sem localização certa no mapa. Quando chegar, mande cheguei e compartilhe a localização: eu atualizo o endereço._',
} as const

/** Sem os marcadores do WhatsApp e sem espaços repetidos: dado de terceiro nunca formata a mensagem. */
export function plainText(value: string): string {
  return value
    .replace(/[*_~`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export const stripLeadingZeros = (value: string): string => value.replace(/^0+(?=\d)/u, '')

/** "1234.5" + "10" = "1244.50"; o que não é decimal fica de fora; nenhum valor = `null`. */
export function sumDecimalAmounts(values: readonly string[]): string | null {
  let cents = 0n
  let counted = 0
  for (const value of values) {
    const match = /^(\d+)(?:\.(\d+))?$/u.exec(value.trim())
    if (match === null) continue
    const [, whole = '0', fraction = ''] = match
    cents += BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2))
    counted += 1
  }
  if (counted === 0) return null
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, '0')}`
}

/** A cidade do rótulo da parada ("RUA X, 12, SAO CARLOS, SP" → "SAO CARLOS"); vazio quando não dá para saber. */
export function cityOfStopLabel(label: string): string {
  const parts = label
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const state = parts.at(-1) ?? ''
  if (parts.length < 3 || !/^[A-Za-z]{2}$/u.test(state)) return ''
  return parts.at(-2) ?? ''
}

/** "14:35", no horário de Brasília. */
export function formatBotClock(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: BOT_TIME_ZONE,
  }).format(date)
}

/** "*NF 17234*" ou "*NFs 17234, 17235*". */
export function describeStopNotes(numbers: readonly string[]): string {
  const clean = numbers.map((number) => stripLeadingZeros(plainText(number))).filter(Boolean)
  if (clean.length === 0) return ''
  return clean.length === 1 ? `*NF ${clean[0]}*` : `*NFs ${clean.join(', ')}*`
}

/** "*NF 17234* · Padaria Sol – Ribeirão Preto": a parada numa linha (a prévia da próxima e as listas). */
export function describeStopShort(
  card: Pick<StopCard, 'city' | 'documentNumbers' | 'recipientName'>,
): string {
  const client = plainText(card.recipientName)
  const city = plainText(card.city)
  return [
    describeStopNotes(card.documentNumbers),
    client === '' ? '' : ` · ${client}`,
    city === '' ? '' : ` – ${city}`,
  ]
    .join('')
    .trim()
}

const roundMinutes = (durationSeconds: number): number =>
  Math.max(1, Math.round(durationSeconds / 60))

/** "108 km", "3,2 km": inteiro a partir de 10 km (a lista de paradas, spec 300 RF4). */
export function describeListDistance(distanceMetres: number): string {
  const tenths = Math.round(distanceMetres / 100)
  if (tenths >= 100) return `${String(Math.round(distanceMetres / 1000))} km`
  return `${(tenths / 10).toFixed(1).replace('.', ',')} km`
}

/** "~8 min", "~1 h 25 min" (a lista de paradas, spec 300 RF4). */
export function describeListDuration(durationSeconds: number): string {
  const minutes = roundMinutes(durationSeconds)
  if (minutes < 60) return `~${String(minutes)} min`
  return `~${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** "📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~14:35 (25 min)_". */
export function describeStopEta(eta: StopCardEta, now: Date): string {
  const kilometres = (eta.distanceMetres / 1000).toFixed(1).replace('.', ',')
  const minutes = roundMinutes(eta.durationSeconds)
  const arrival = formatBotClock(new Date(now.getTime() + eta.durationSeconds * 1000))
  return `📏 *${kilometres} km* do seu último ponto · ⏱️ _chegada prevista ~${arrival} (${minutes} min)_`
}

export type StopCardOptions = {
  /** Presente só quando o motorista compartilhou um ponto nesta viagem e a estrada respondeu. */
  readonly eta?: { readonly now: Date; readonly value: StopCardEta } | undefined
  /** "volumes" na saída e na oferta; "volumes para entregar" na chegada. */
  readonly volumesSuffix?: string
  /** O aviso de endereço sem localização certa (saída e oferta, spec 294 RF12). */
  readonly warnsUnreliableAddress?: boolean
}

/** As linhas do bloco da parada; linha sem dado some (nunca "📍 " vazio). */
export function describeStopCard(card: StopCard, options: StopCardOptions = {}): string[] {
  const notes = describeStopNotes(card.documentNumbers)
  const money = card.totalValue === null ? null : formatGroupMoney(card.totalValue)
  const client = plainText(card.recipientName)
  const contractor = plainText(card.contractorName)
  const address = plainText(card.address)
  const volumes = card.volumes !== null && card.volumes > 0 ? card.volumes : null
  const position =
    card.totalStops > 0
      ? `*Parada ${card.sequence} de ${card.totalStops}*`
      : `*Parada ${card.sequence}*`
  return [
    position,
    ...(notes === '' ? [] : [money === null ? notes : `${notes} · ${money}`]),
    ...(client === '' ? [] : [`🏪 *${client}*`]),
    ...(contractor === '' ? [] : [`🏢 Contratante: ${contractor}`]),
    ...(address === '' ? [] : [`📍 ${address}`]),
    ...(card.coordinate === null ? [] : [`🗺️ ${buildRouteOfferMapUrl(card.coordinate)}`]),
    ...(volumes === null
      ? []
      : [`📦 ${volumes} ${volumes === 1 ? 'volume' : 'volumes'}${options.volumesSuffix ?? ''}`]),
    ...(options.eta === undefined ? [] : [describeStopEta(options.eta.value, options.eta.now)]),
    ...(options.warnsUnreliableAddress === true && !card.isAddressReliable
      ? [STOP_CARD_TEXT.unreliableAddress]
      : []),
  ]
}
