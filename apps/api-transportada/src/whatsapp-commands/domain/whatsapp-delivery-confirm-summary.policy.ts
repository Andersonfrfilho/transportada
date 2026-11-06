/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O resumo do "Confirma a entrega?": a nota (contratante, cliente, endereço, valor) e o que foi colhido de
 * verdade (fotos, quem recebeu, localização), no mesmo capricho do resumo da ocorrência. Antes só listava
 * os nomes dos itens ("foto do canhoto"), e o motorista confirmava sem ver de qual entrega se tratava.
 */
import type { ReceivedBy } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import { formatSpokenNoteAmount } from '../../whatsapp/domain/bot-spoken-note.policy.js'
import { RECEIVED_BY_LABELS } from './whatsapp-delivery-proof-speech.constant.js'
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
  readonly skipped: readonly string[]
}

const filled = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== ''

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`)

export function describeDeliveryConfirmDocument(document: DeliveryConfirmDocument): string[] {
  const amount = filled(document.amount) ? formatSpokenNoteAmount(document.amount) : ''
  return [
    ...(filled(document.contractor) ? [`🏢 Contratante: ${document.contractor.trim()}`] : []),
    ...(filled(document.client) ? [`👤 Cliente: ${document.client.trim()}`] : []),
    ...(filled(document.address) ? [`🏠 Endereço: ${document.address.trim()}`] : []),
    ...(amount === '' ? [] : [`💰 Valor da nota: *${amount}*`]),
  ]
}

export function describeDeliveryConfirmCollected(collected: DeliveryConfirmCollected): string[] {
  const receiver = describeReceiver(collected.receivedBy)
  return [
    ...(collected.canhotoPhotos > 0 ? ['🧾 Canhoto: foto recebida'] : []),
    ...(collected.cargoPhotos > 0 ? [`📦 Mercadoria: ${photos(collected.cargoPhotos)}`] : []),
    ...(receiver === '' ? [] : [`🙋 Recebido por: ${receiver}`]),
    ...describeLocation(collected),
  ]
}

/** Só o vínculo ("Porteiro"): o nome de quem recebeu é opcional e não é repetido (spec 293, regra 9). */
function describeReceiver(receivedBy: null | ReceivedBy): string {
  return receivedBy === null ? '' : RECEIVED_BY_LABELS[receivedBy]
}

function describeLocation(collected: DeliveryConfirmCollected): string[] {
  const { location } = collected
  if (location !== null) {
    return [`📍 Localização: https://maps.google.com/?q=${location.latitude},${location.longitude}`]
  }
  return collected.skipped.includes(DELIVERY_PROOF_ITEM.location)
    ? ['📍 Localização: não enviada']
    : []
}
