/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O resumo do "Confirma a entrega?" (spec 300, fluxo 5): a nota em citação (contratante, cliente, endereço, valor) e
 * o que foi colhido de verdade (fotos, quem recebeu com o nome, localização), para o motorista ver de qual entrega se trata.
 */
import type { ReceivedBy } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import { formatSpokenNoteAmount } from '../../whatsapp/domain/bot-spoken-note.policy.js'
import {
  describeReceivedByInSentence,
  RECEIVED_BY_LABELS,
} from './whatsapp-delivery-received-by.constant.js'
import { DELIVERY_PROOF_ITEM } from './whatsapp-delivery-proof-checklist.policy.js'

/** Os dados da nota; cada um só aparece quando existe. */
export type DeliveryConfirmDocument = {
  readonly address?: string | undefined
  readonly amount?: string | undefined
  readonly client?: string | undefined
  readonly contractor?: string | undefined
}

export type DeliveryConfirmCollected = {
  readonly cargoPhotos: number
  readonly canhotoPhotos: number
  readonly location: null | ReportedLocation
  readonly receivedBy: null | ReceivedBy
  readonly receiverName: null | string
  readonly skipped: readonly string[]
}

const filled = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== ''

const QUOTE_PREFIX = '> '

const describePhotos = (count: number) =>
  count === 1 ? '1 foto recebida ✅' : `${count} fotos recebidas ✅`

export function describeDeliveryConfirmDocument(document: DeliveryConfirmDocument): string[] {
  const amount = filled(document.amount) ? formatSpokenNoteAmount(document.amount) : ''
  return [
    ...(filled(document.contractor) ? [`🏢 Contratante: ${document.contractor.trim()}`] : []),
    ...(filled(document.client) ? [`🏪 Cliente: *${document.client.trim()}*`] : []),
    ...(filled(document.address) ? [`📍 ${document.address.trim()}`] : []),
    ...(amount === '' ? [] : [`💰 Valor da nota: *${amount}*`]),
  ].map((line) => `${QUOTE_PREFIX}${line}`)
}

export function describeDeliveryConfirmCollected(collected: DeliveryConfirmCollected): string[] {
  const receiver = describeReceiver(collected)
  return [
    ...describePhotoLine(
      '🧾 Canhoto',
      collected.canhotoPhotos,
      collected.skipped.includes(DELIVERY_PROOF_ITEM.photo),
      'foto recebida ✅',
    ),
    ...describePhotoLine(
      '📦 Mercadoria',
      collected.cargoPhotos,
      collected.skipped.includes(DELIVERY_PROOF_ITEM.cargo),
      describePhotos(collected.cargoPhotos),
    ),
    ...(receiver === '' ? [] : [`🙋 Recebido por: ${receiver}`]),
    ...describeLocation(collected),
  ]
}

function describePhotoLine(
  label: string,
  count: number,
  isSkipped: boolean,
  received: string,
): string[] {
  if (count > 0) return [`${label}: ${received}`]
  return isSkipped ? [`${label}: sem foto`] : []
}

/** O nome em negrito e o vínculo entre parênteses; só um deles, o que houver ("Recebido por: *Porteiro*"). */
function describeReceiver(collected: DeliveryConfirmCollected): string {
  const name = collected.receiverName?.trim() ?? ''
  const { receivedBy } = collected
  if (name !== '' && receivedBy !== null)
    return `*${name}* (${describeReceivedByInSentence(receivedBy)})`
  if (name !== '') return `*${name}*`
  return receivedBy === null ? '' : `*${RECEIVED_BY_LABELS[receivedBy]}*`
}

function describeLocation(collected: DeliveryConfirmCollected): string[] {
  if (collected.location !== null) return ['📍 Localização: enviada ✅']
  return collected.skipped.includes(DELIVERY_PROOF_ITEM.location)
    ? ['📍 Localização: não enviada']
    : []
}
