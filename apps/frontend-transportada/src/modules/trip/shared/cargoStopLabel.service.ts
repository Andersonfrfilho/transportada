/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopDetail } from './trip.types'

export type CargoStopLabel = Readonly<{
  /** O nome de quem recebe — a primeira coisa que quem carrega procura. */
  clientName: string
  /** Onde a carga é deixada. */
  addressLabel: string
  /** Os números das notas daquela parada, na ordem em que aparecem. */
  noteNumbers: readonly string[]
  sequence: number
}>

/** Quantos números de nota cabem numa ficha antes de ela virar uma linha de texto. */
const MAX_LISTED_NOTES = 3

/**
 * O que identifica uma parada para quem está carregando.
 *
 * ⚠️ **"Parada 3" não identifica nada.** O separador procura o número da nota que ele bipou e o nome
 * do cliente na etiqueta; a ordem é só a posição na fila, e sozinha ela obriga a pessoa a voltar à
 * lista de notas para descobrir de quem é a carga que está na mão dela.
 */
export function buildCargoStopLabels(
  stops: readonly TripStopDetail[],
): ReadonlyMap<number, CargoStopLabel> {
  return new Map(
    stops.map((stop) => [
      stop.sequence,
      {
        addressLabel: stop.label,
        /** Uma parada agrupa endereço, não cliente: com mais de um, o primeiro nomeia e o resto é contado. */
        clientName: stop.documents[0]?.contact?.name ?? '',
        noteNumbers: stop.documents.flatMap((document) =>
          document.nfeNumber === null || document.nfeNumber === undefined
            ? []
            : [document.nfeNumber],
        ),
        sequence: stop.sequence,
      },
    ]),
  )
}

/**
 * A ficha da parada em uma linha: notas, cliente e endereço.
 *
 * ⚠️ A lista de notas é **cortada**, nunca omitida: uma parada com quarenta notas viraria uma ficha
 * do tamanho da tela, e nenhuma nota some sem que o "+N" diga quantas ficaram.
 */
export function formatCargoStopLabel(label: CargoStopLabel | undefined): string {
  if (label === undefined) return ''

  const listed = label.noteNumbers.slice(0, MAX_LISTED_NOTES).join(', ')
  const hidden = label.noteNumbers.length - MAX_LISTED_NOTES
  const notes = hidden > 0 ? `${listed} +${String(hidden)}` : listed

  return [notes, label.clientName, label.addressLabel].filter((part) => part !== '').join(' · ')
}
