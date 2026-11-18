/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Espera longa (18/11/2026): os eventos da entrega que o aviso à contratante mostra — quando o motorista saiu para a
 * parada da nota, quando chegou, há quanto tempo espera e a janela de recebimento do cliente. Uma leitura só, usada
 * pelo aviso no grupo e pelo e-mail: o mesmo valor nos dois canais.
 */
import { sql } from 'drizzle-orm'

import { formatElapsedWait } from '../domain/contractor-occurrence-group.policy.js'
import { formatOccurrenceMoment } from '../../trips/domain/occurrence-mail-values.policy.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

type Row = Record<string, unknown>

async function rowsOf(queryable: TripQueryable, query: ReturnType<typeof sql>) {
  return (await queryable.execute(query)) as unknown as readonly Row[]
}

function text(row: Row | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === 'string' ? value : ''
}

const SAO_PAULO_TIME = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string' && value !== '') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Os eventos da entrega da parada da nota: quando o motorista saiu para ela (`departed`), quando chegou (`arrived`)
 * e a janela de recebimento do cliente. O momento do evento é o do toque (`occurred_at`, senão `tapped_at`, senão a
 * hora do servidor). Sem o evento, a variável sai vazia e a linha some do texto.
 */
async function readStopEvents(
  database: TripQueryable,
  params: { readonly companyId: string; readonly documentId: string },
): Promise<{
  readonly arrivedAt: Date | null
  readonly departedAt: Date | null
  readonly windowEnd: Date | null
  readonly windowStart: Date | null
}> {
  const [stop] = await rowsOf(
    database,
    sql`select stop.id as stop_id, stop.delivery_window_start, stop.delivery_window_end
        from trip_documents document
        join trip_stops stop
          on stop.company_id = document.company_id and stop.id = document.stop_id
        where document.company_id = ${params.companyId}::uuid
          and document.id = ${params.documentId}::uuid`,
  )
  const stopId = text(stop, 'stop_id')
  if (stopId === '')
    return { arrivedAt: null, departedAt: null, windowEnd: null, windowStart: null }
  const events = await rowsOf(
    database,
    sql`select kind, coalesce(occurred_at, tapped_at, recorded_at) as moment
        from trip_stop_events
        where company_id = ${params.companyId}::uuid
          and stop_id = ${stopId}::uuid
          and kind in ('departed', 'arrived', 'departure_cancelled')`,
  )
  /** O instante mais recente do tipo, pela hora do evento (a fila offline entrega fora de ordem), nunca pela da gravação. */
  const latest = (kind: string): Date | null => {
    let found: Date | null = null
    for (const event of events) {
      if (text(event, 'kind') !== kind) continue
      const moment = asDate(event.moment)
      if (moment !== null && (found === null || moment.getTime() > found.getTime())) found = moment
    }
    return found
  }
  /** A saída cancelada depois da última saída deixa de valer: o motorista ainda não saiu. */
  const departed = latest('departed')
  const cancelled = latest('departure_cancelled')
  const departedAt =
    departed !== null && cancelled !== null && cancelled.getTime() >= departed.getTime()
      ? null
      : departed
  return {
    arrivedAt: latest('arrived'),
    departedAt,
    windowEnd: asDate(stop?.delivery_window_end),
    windowStart: asDate(stop?.delivery_window_start),
  }
}

/** Os quatro valores prontos para o texto; vazio onde o evento não existe (a linha some do aviso). */
export type OccurrenceStopEventValues = Readonly<{
  chegada: string
  inicioRota: string
  janelaRecebimento: string
  tempoEspera: string
}>

export async function readOccurrenceStopEventValues(
  database: TripQueryable,
  params: {
    readonly companyId: string
    readonly documentId: string
    readonly now: () => Date
  },
): Promise<OccurrenceStopEventValues> {
  if (params.documentId === '') {
    return { chegada: '', inicioRota: '', janelaRecebimento: '', tempoEspera: '' }
  }
  const events = await readStopEvents(database, params)
  const formatMoment = (value: Date | null): string =>
    value === null ? '' : formatOccurrenceMoment(value)
  return {
    chegada: formatMoment(events.arrivedAt),
    inicioRota: formatMoment(events.departedAt),
    janelaRecebimento:
      events.windowStart !== null && events.windowEnd !== null
        ? `${SAO_PAULO_TIME.format(events.windowStart)} às ${SAO_PAULO_TIME.format(events.windowEnd)}`
        : '',
    tempoEspera: formatElapsedWait(events.arrivedAt, params.now()),
  }
}
