/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.3–T3.5 (RF2, RF3, RF7b): o bloco da parada que o bot mostra nos passos da rota (saída, chegada, menus,
 * próxima) sai do mesmo `formatStopBlock` da lista; aqui só se traduz o `StopCard` lido da viagem para o bloco.
 */
import {
  formatBotClock,
  describeListDistance,
  describeListDuration,
  plainText,
} from './whatsapp-stop-card.policy.js'
import type { StopCard, StopCardEta } from './whatsapp-stop-card.policy.js'
import { formatStopBlock, type MessageStop } from './whatsapp-message-format.policy.js'
import { formatGroupMoney } from '../../whatsapp/application/whatsapp-group-occurrence-flow.service.js'
import { formatPlaceName } from './whatsapp-stop-place.policy.js'

const stripZeros = (value: string): string => value.replace(/^0+(?=\d)/u, '')

function describeVolumes(volumes: number | null): string | undefined {
  if (volumes === null || volumes <= 0) return undefined
  return `${volumes} ${volumes === 1 ? 'volume' : 'volumes'}`
}

function coordinateOf(card: StopCard): MessageStop['coordinate'] {
  if (card.coordinate === null) return undefined
  const latitude = Number(card.coordinate.latitude)
  const longitude = Number(card.coordinate.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : undefined
}

export function toMessageStop(card: StopCard, eta?: StopCardEta | undefined): MessageStop {
  const [first, ...others] = card.documentNumbers
    .map((number) => stripZeros(plainText(number)))
    .filter((number) => number !== '')
  return {
    address: plainText(card.address),
    city: formatPlaceName(plainText(card.city)),
    clientName: plainText(card.recipientName),
    contractorName: plainText(card.contractorName),
    coordinate: coordinateOf(card),
    distance: eta === undefined ? undefined : describeListDistance(eta.distanceMetres),
    district: card.district,
    duration: eta === undefined ? undefined : describeListDuration(eta.durationSeconds),
    invoiceNumber: first ?? '',
    otherInvoiceNumbers: others,
    sequence: card.sequence,
    total: card.totalStops,
    volumes: describeVolumes(card.volumes),
  }
}

export type DescribeStopBlockParams = {
  readonly card: StopCard
  readonly detail: 'list' | 'card'
  readonly eta?: StopCardEta | undefined
  readonly header?: string | undefined
  readonly quote?: 'right' | 'off-route' | undefined
}

/** O bloco do desenho; sem o total da viagem (bloco mínimo da lista de paradas) o cabeçalho é só "PARADA N". */
export function describeStopBlock(params: DescribeStopBlockParams): string {
  const { card } = params
  const header = params.header ?? (card.totalStops > 0 ? undefined : `*PARADA ${card.sequence}*`)
  return formatStopBlock({
    detail: params.detail,
    stop: toMessageStop(card, params.eta),
    ...(header === undefined ? {} : { header }),
    ...(params.quote === undefined ? {} : { quote: params.quote }),
  })
}

export type DescribeStopDetailsParams = {
  readonly card: StopCard
  readonly eta?: StopCardEta | undefined
  readonly now?: Date | undefined
}

/**
 * O bloco completo da saída e da chegada, em citação, com o valor da nota e (na saída, com estrada) a chegada
 * prevista: "> 💰 Valor da nota: *R$ 4.812,30*", "> ⏱️ Chegada prevista: *~23:23*".
 */
export function describeStopDetails(params: DescribeStopDetailsParams): string {
  const { card, eta, now } = params
  const money = card.totalValue === null ? null : formatGroupMoney(card.totalValue)
  const arrival =
    eta === undefined || now === undefined
      ? undefined
      : formatBotClock(new Date(now.getTime() + eta.durationSeconds * 1000))
  const extra = [
    ...(money === null ? [] : [`> 💰 Valor da nota: *${money}*`]),
    ...(arrival === undefined ? [] : [`> ⏱️ Chegada prevista: *~${arrival}*`]),
  ]
  const block = describeStopBlock({ card, detail: 'card', eta, quote: 'right' })
  return [block, ...extra].join('\n')
}
