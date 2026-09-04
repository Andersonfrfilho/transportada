/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AssemblyCityOrder } from './assemblyOrder.service'
import type { AssemblyMapPoint } from './assemblyMap.service'

/**
 * A ordem que o **roteirizador** propôs, aplicada à ordem que este diálogo manipula.
 *
 * ⚠️ **`AssemblyCityOrder` mente no nome: ela não guarda código de cidade, guarda chave de parada.**
 * Quem a alimenta é `reconcileCityOrder`, com `buildStopAddressKey(...)` — `cidade|CEP|número`, a
 * mesma coisa que `route_suggestion_stops.address_key`. Isso é sorte boa e vale escrever: as duas
 * pontas já falam a mesma língua, e o casamento é direto, sem passar pelo `cityCode` dos pontos.
 *
 * ⚠️ Nota sem CEP não produz chave e cai num `cidade:<código>` que o solver **nunca** emite. Essas
 * ficam no fim, na ordem em que estavam — mesma regra que `proposeCityOrder` usa para o que não tem
 * ponto no mapa. Reordená-las por conta própria seria inventar roteiro para o que ninguém calculou.
 */
export type SolverStop = Readonly<{
  addressKey: string
  sequence: number
}>

export function toCityOrderFromSolver(input: {
  readonly order: AssemblyCityOrder
  readonly stops: readonly SolverStop[]
}): AssemblyCityOrder {
  /** A menor sequência por chave: a parada repetida na resposta vale pela primeira aparição. */
  const sequenceByKey = new Map<string, number>()
  for (const stop of input.stops) {
    const seen = sequenceByKey.get(stop.addressKey)
    if (seen === undefined || stop.sequence < seen)
      sequenceByKey.set(stop.addressKey, stop.sequence)
  }

  /** Nenhuma parada reconhecida devolve a ordem intacta — não se embaralha o que não foi calculado. */
  if (sequenceByKey.size === 0) return input.order

  const posicionadas = input.order
    .filter((key) => sequenceByKey.has(key))
    .sort((left, right) => (sequenceByKey.get(left) ?? 0) - (sequenceByKey.get(right) ?? 0))
  const restantes = input.order.filter((key) => !sequenceByKey.has(key))

  return [...posicionadas, ...restantes]
}

/**
 * As notas que entram no pedido ao solver. Ele recebe **identificador de NF-e persistida**, não
 * coordenada: é assim que ele alcança endereço geocodificado, janela de entrega e peso — o que
 * separa este roteiro do palpite em linha reta.
 */
export function documentIdsOf(points: readonly AssemblyMapPoint[]): readonly string[] {
  return points.flatMap((point) => point.notes.map((note) => note.id))
}
