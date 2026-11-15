/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O bot situa o motorista na viagem antes de pedir a nota: qual viagem, em que parada ele está (ou qual é a próxima),
 * quantas notas faltam e a lista agrupada por parada. Funções puras: o texto sai daqui, nunca montado à mão no fluxo.
 */

/** Onde o motorista está em relação à parada da nota. */
export type BotStopState = 'arrived' | 'done' | 'en_route' | 'later' | 'next'

export type BotStopContext = {
  readonly arrivedAt?: string | null | undefined
  /** Cidade (ou rótulo curto) da parada; vazio quando não se sabe. */
  readonly city: string
  readonly sequence: number
  readonly state: BotStopState
  readonly totalStops: number
}

export type BotContextDocument = {
  readonly number: string
  readonly recipientName?: string | undefined
  readonly stop?: BotStopContext | undefined
  readonly vehiclePlate?: string | undefined
}

const STATE_LINE: Record<BotStopState, string> = {
  arrived: 'você está aqui',
  done: 'já concluída',
  en_route: 'você está a caminho',
  later: 'mais adiante',
  next: 'a próxima',
}

const STATE_ICON: Record<BotStopState, string> = {
  arrived: '📍',
  done: '✔️',
  en_route: '🚚',
  later: '⏭️',
  next: '➡️',
}

const ORDER: Record<BotStopState, number> = { arrived: 0, done: 4, en_route: 1, later: 3, next: 2 }

const present = (value: string | undefined): value is string => value !== undefined && value !== ''

function stopTitle(stop: BotStopContext): string {
  const place = stop.city === '' ? '' : ` · ${stop.city}`
  return `${STATE_ICON[stop.state]} *Parada ${stop.sequence} de ${stop.totalStops}${place}* — ${STATE_LINE[stop.state]}`
}

/** "🚚 Viagem do *ABC1D23* · 3 notas em aberto em 2 paradas" — uma linha que diz onde o motorista está. */
export function describeTripSituation(documents: readonly BotContextDocument[]): null | string {
  const withStop = documents.filter((document) => document.stop !== undefined)
  if (withStop.length === 0) return null
  const plate = documents.find((document) => present(document.vehiclePlate))?.vehiclePlate
  const open = withStop.filter((document) => document.stop?.state !== 'done')
  const stops = new Set(open.map((document) => document.stop?.sequence))
  const notes = `${open.length} ${open.length === 1 ? 'nota em aberto' : 'notas em aberto'}`
  const where = `${stops.size} ${stops.size === 1 ? 'parada' : 'paradas'}`
  return `🚚 ${present(plate) ? `Viagem do *${plate}* · ` : ''}${notes} em ${where}`
}

/**
 * Ordena as notas como a lista as mostra (parada em que está, a caminho, próxima, adiante) — a numeração da opção é a
 * posição nesta ordem, e quem escolhe a nota usa a mesma ordem.
 */
export function orderDocumentsByStop<T extends BotContextDocument>(documents: readonly T[]): T[] {
  return [...documents].sort((left, right) => {
    const a = left.stop
    const b = right.stop
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
    return ORDER[a.state] - ORDER[b.state] || a.sequence - b.sequence
  })
}

/**
 * A lista numerada de notas agrupada por parada, na ordem recebida (use `orderDocumentsByStop` antes). Sem informação
 * de parada, volta à lista seca de antes.
 */
export function describeDocumentsByStop(
  documents: readonly BotContextDocument[],
  describe: (document: BotContextDocument) => string,
): string[] {
  const lines: string[] = []
  let lastSequence: number | undefined
  documents.forEach((document, index) => {
    const { stop } = document
    if (stop !== undefined && stop.sequence !== lastSequence) {
      if (lines.length > 0) lines.push('')
      lines.push(stopTitle(stop))
      lastSequence = stop.sequence
    }
    lines.push(`*${index + 1}* · ${describe(document)}`)
  })
  return lines
}
