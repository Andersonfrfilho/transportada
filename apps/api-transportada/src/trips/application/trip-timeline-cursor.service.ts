/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9 (correção do orquestrador): codec do cursor opaco da linha do tempo, extraído da
 * infraestrutura para não misturar SQL com o parse/encode. `occurredAt` viaja como **texto com
 * microssegundos**, nunca `Date` — o mesmo molde de `GET /nfe-documents`
 * (`drizzle-nfe-document.repository.ts`, `formatCursorTimestamp`): `occurred_at` é `timestamptz`
 * (µs) e `Date` só guarda milissegundos, então um cursor construído a partir de `Date.toISOString()`
 * arredonda para baixo e a comparação `(occurred_at, prioridade, id) < cursor` passa a excluir
 * linhas com o mesmo instante que o cursor, mas microssegundos maiores — exatamente o caso de vários
 * eventos gravados no mesmo `now()` de uma transação.
 */
import { TRIP_TIMELINE_KIND_PRIORITY } from './trip-timeline.types.js'
import type { TripTimelineCursor } from './trip-timeline.types.js'

/** Formato exato de `formatTimelineTimestampKey` (infraestrutura): UTC, microssegundos, `Z`. */
const TIMELINE_CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const VALID_KIND_PRIORITIES = new Set(Object.values(TRIP_TIMELINE_KIND_PRIORITY))

/**
 * Decodifica o cursor opaco desta leitura (base64url de JSON). **Não é validação de borda** — só
 * aceita o formato que `encodeTripTimelineCursor` produziu, com todos os três campos dentro do
 * domínio esperado (`id` uuid, `kindPriority` numa das prioridades reais, `occurredAt` no formato
 * de microssegundos); qualquer desvio — inclusive um cursor forjado com id não-uuid ou prioridade
 * fora da tabela, que estourariam no `::uuid`/`::int` do SQL — devolve `null`, nunca lança. A
 * validação Zod do parâmetro de querystring (formato, presença) é da rota (T6); este parse é
 * reaproveitado por ela para virar o `TripTimelineCursor` tipado que `listTripTimeline` usa.
 */
export function parseTripTimelineCursor(value: string | null): TripTimelineCursor | null {
  if (value === null) return null
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as {
      readonly id?: unknown
      readonly kindPriority?: unknown
      readonly occurredAt?: unknown
    }
    if (typeof parsed.id !== 'string' || !UUID_PATTERN.test(parsed.id)) return null
    if (typeof parsed.kindPriority !== 'number' || !VALID_KIND_PRIORITIES.has(parsed.kindPriority))
      return null
    if (
      typeof parsed.occurredAt !== 'string' ||
      !TIMELINE_CURSOR_TIMESTAMP_PATTERN.test(parsed.occurredAt)
    )
      return null
    return { id: parsed.id, kindPriority: parsed.kindPriority, occurredAt: parsed.occurredAt }
  } catch {
    return null
  }
}

export function encodeTripTimelineCursor(cursor: TripTimelineCursor): string {
  const payload = JSON.stringify({
    id: cursor.id,
    kindPriority: cursor.kindPriority,
    occurredAt: cursor.occurredAt,
  })
  return Buffer.from(payload, 'utf8').toString('base64url')
}
