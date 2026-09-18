/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A ordem das paradas sem o endereço dentro. A chave da parada é `cidade|CEP|número` — endereço de
 * pessoa física, e CEP é curto demais para um hash esconder. No rascunho a parada é representada
 * pelo **id da primeira nota dela**, e a chave é recalculada na volta, das notas relidas.
 */
import { resolveStopKey } from './assemblyOrder.service'

export type StopOrderDocument = Readonly<{
  id: string
  recipientAddressNumber: null | string
  recipientCityCode: null | string
  recipientPostalCode: null | string
}>

function stopKeyOf(document: StopOrderDocument): string {
  return resolveStopKey({
    cityCode: document.recipientCityCode,
    number: document.recipientAddressNumber,
    postalCode: document.recipientPostalCode,
  })
}

/** Parada sem nota conhecida some: não há como representá-la sem o endereço. */
export function encodeStopOrder(
  input: Readonly<{ documents: readonly StopOrderDocument[]; order: readonly string[] }>,
): readonly string[] {
  const representativeByKey = new Map<string, string>()
  for (const document of input.documents) {
    const key = stopKeyOf(document)
    if (!representativeByKey.has(key)) representativeByKey.set(key, document.id)
  }
  return input.order.flatMap((key) => {
    const documentId = representativeByKey.get(key)
    return documentId === undefined ? [] : [documentId]
  })
}

/** Nota que não voltou (virou viagem) leva a parada junto; a ordem das outras é preservada. */
export function decodeStopOrder(
  input: Readonly<{ documentIds: readonly string[]; documents: readonly StopOrderDocument[] }>,
): readonly string[] {
  const byId = new Map(input.documents.map((document) => [document.id, document]))
  const keys = input.documentIds.flatMap((id) => {
    const document = byId.get(id)
    return document === undefined ? [] : [stopKeyOf(document)]
  })
  return [...new Set(keys)]
}

export function encodeStopOrderByVehicle(
  input: Readonly<{
    documents: readonly StopOrderDocument[]
    orders: ReadonlyMap<string, readonly string[]>
  }>,
): readonly (readonly [string, readonly string[]])[] {
  return [...input.orders].map(([vehicleId, order]) => [
    vehicleId,
    encodeStopOrder({ documents: input.documents, order }),
  ])
}

export function decodeStopOrderByVehicle(
  input: Readonly<{
    documents: readonly StopOrderDocument[]
    orders: readonly (readonly [string, readonly string[]])[]
  }>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    input.orders.map(([vehicleId, documentIds]) => [
      vehicleId,
      decodeStopOrder({ documentIds, documents: input.documents }),
    ]),
  )
}
