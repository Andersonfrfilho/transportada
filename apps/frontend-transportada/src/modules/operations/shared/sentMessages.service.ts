/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 290: o quadro de mensagens enviadas. Só contagem — a API não devolve telefone, e-mail nem texto.
 */
export type SentMessagesTotals = Readonly<{ failed: number; sent: number; total: number }>

export type SentMessages = Readonly<{
  byCategory: readonly (SentMessagesTotals & Readonly<{ category: string }>)[]
  byChannel: readonly (SentMessagesTotals & Readonly<{ channel: string }>)[]
  bySubcategory: readonly (SentMessagesTotals &
    Readonly<{ audience: string; category: string; channel: string; subcategory: string }>)[]
  from: string
  to: string
  total: SentMessagesTotals
  unavailable: readonly string[]
}>

export const SENT_MESSAGES_PERIODS = [
  { hours: 24, key: 'day' },
  { hours: 24 * 7, key: 'week' },
  { hours: 24 * 30, key: 'month' },
] as const
export type SentMessagesPeriodKey = (typeof SENT_MESSAGES_PERIODS)[number]['key']

export function sentMessagesWindow(
  period: SentMessagesPeriodKey,
  now: Date,
): Readonly<{ from: string; to: string }> {
  const hours = SENT_MESSAGES_PERIODS.find((entry) => entry.key === period)?.hours ?? 24
  return {
    from: new Date(now.getTime() - hours * 3_600_000).toISOString(),
    to: now.toISOString(),
  }
}

export function sentMessagesFromApi(body: unknown): SentMessages {
  const data = (body as { data?: unknown } | null)?.data
  if (typeof data !== 'object' || data === null) throw new Error('SENT_MESSAGES_RESPONSE_INVALID')
  const value = data as Record<string, unknown>
  const total = totalsOf(value.total)
  if (
    total === null ||
    typeof value.from !== 'string' ||
    typeof value.to !== 'string' ||
    !Array.isArray(value.byCategory) ||
    !Array.isArray(value.byChannel) ||
    !Array.isArray(value.bySubcategory) ||
    !Array.isArray(value.unavailable)
  ) {
    throw new Error('SENT_MESSAGES_RESPONSE_INVALID')
  }
  return {
    byCategory: value.byCategory.flatMap((entry: Record<string, unknown>) => {
      const totals = totalsOf(entry)
      return totals !== null && typeof entry.category === 'string'
        ? [{ category: entry.category, ...totals }]
        : []
    }),
    byChannel: value.byChannel.flatMap((entry: Record<string, unknown>) => {
      const totals = totalsOf(entry)
      return totals !== null && typeof entry.channel === 'string'
        ? [{ channel: entry.channel, ...totals }]
        : []
    }),
    bySubcategory: value.bySubcategory.flatMap((entry: Record<string, unknown>) => {
      const totals = totalsOf(entry)
      return totals !== null &&
        typeof entry.category === 'string' &&
        typeof entry.channel === 'string' &&
        typeof entry.subcategory === 'string'
        ? [
            {
              audience: typeof entry.audience === 'string' ? entry.audience : '',
              category: entry.category,
              channel: entry.channel,
              subcategory: entry.subcategory,
              ...totals,
            },
          ]
        : []
    }),
    from: value.from,
    to: value.to,
    total,
    unavailable: value.unavailable.filter((entry): entry is string => typeof entry === 'string'),
  }
}

function totalsOf(value: unknown): SentMessagesTotals | null {
  if (typeof value !== 'object' || value === null) return null
  const { failed, sent, total } = value as Record<string, unknown>
  if (typeof failed !== 'number' || typeof sent !== 'number' || typeof total !== 'number') {
    return null
  }
  return { failed, sent, total }
}

/** A taxa de falha em porcentagem inteira; `null` sem envio, para a tela não mostrar "0%" de nada. */
export function failureRate(totals: SentMessagesTotals): null | number {
  return totals.total === 0 ? null : Math.round((totals.failed / totals.total) * 100)
}
