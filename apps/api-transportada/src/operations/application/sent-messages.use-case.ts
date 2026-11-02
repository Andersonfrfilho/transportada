/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 290: o quadro de mensagens enviadas. Cada fonte devolve linhas já agrupadas (categoria, canal, subcategoria,
 * status, contagem); aqui elas se juntam. Só contagem: nenhum telefone, e-mail ou texto passa por este caminho.
 */
import { ApiError } from '../../shared/api.error.js'

const DAY_MS = 86_400_000
const DEFAULT_WINDOW_MS = DAY_MS
const MAX_WINDOW_MS = 90 * DAY_MS
const MAX_SUBCATEGORIES = 50

export type SentMessagesStatus = 'failed' | 'sent'

export type SentMessagesSourceRow = {
  /** Com quem a mensagem fala (`client`, `contractor`, `driver`); vazio quando a fonte não distingue. */
  readonly audience?: string
  readonly category: string
  readonly channel: string
  readonly count: number
  readonly status: SentMessagesStatus
  readonly subcategory: string
}

export type SentMessagesQuery = {
  readonly companyId: string
  readonly from: Date
  readonly to: Date
}

export type SentMessagesSource = {
  readonly category: string
  /** Nome estável da fonte, devolvido em `unavailable` quando ela falha. */
  readonly key: string
  readonly read: (query: SentMessagesQuery) => Promise<readonly SentMessagesSourceRow[]>
}

type Totals = { failed: number; sent: number; total: number }

export type SentMessagesResult = {
  readonly byCategory: readonly ({ readonly category: string } & Totals)[]
  readonly byChannel: readonly ({ readonly channel: string } & Totals)[]
  readonly bySubcategory: readonly ({
    readonly audience: string
    readonly category: string
    readonly channel: string
    readonly subcategory: string
  } & Totals)[]
  readonly from: string
  readonly to: string
  readonly total: Totals
  readonly unavailable: readonly string[]
}

export type SentMessagesContext = {
  readonly companyId: string
  readonly permissions: ReadonlySet<string>
  readonly userId: string
}

export function createSentMessagesUseCase(dependencies: {
  readonly now: () => Date
  readonly sources: readonly SentMessagesSource[]
}): {
  readonly read: (input: {
    readonly context: SentMessagesContext
    readonly from?: Date | undefined
    readonly to?: Date | undefined
  }) => Promise<SentMessagesResult>
} {
  return {
    async read(input) {
      if (!input.context.permissions.has('operations.read')) {
        throw new ApiError({
          code: 'OPERATIONS_READ_FORBIDDEN',
          message: 'Operations access denied',
          status: 403,
        })
      }
      const now = dependencies.now()
      const to = input.to ?? now
      const from = input.from ?? new Date(to.getTime() - DEFAULT_WINDOW_MS)
      if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime()) ||
        to.getTime() > now.getTime() ||
        from.getTime() >= to.getTime() ||
        to.getTime() - from.getTime() > MAX_WINDOW_MS
      ) {
        throw new ApiError({
          code: 'SENT_MESSAGES_WINDOW_INVALID',
          message: 'The window must end now or earlier, start before it, and span at most 90 days',
          status: 400,
        })
      }

      const unavailable: string[] = []
      const rows: SentMessagesSourceRow[] = []
      const results = await Promise.all(
        dependencies.sources.map(async (source) => {
          try {
            return {
              key: source.key,
              rows: await source.read({ companyId: input.context.companyId, from, to }),
            }
          } catch {
            // Uma fonte fora do ar não derruba o quadro (RF5); o motivo não sai: pode trazer nome de tabela.
            return { key: source.key, rows: null }
          }
        }),
      )
      for (const result of results) {
        if (result.rows === null) unavailable.push(result.key)
        else rows.push(...result.rows)
      }

      return aggregate(rows, from, to, unavailable)
    },
  }
}

function aggregate(
  rows: readonly SentMessagesSourceRow[],
  from: Date,
  to: Date,
  unavailable: readonly string[],
): SentMessagesResult {
  const total = emptyTotals()
  const byChannel = new Map<string, Totals>()
  const byCategory = new Map<string, Totals>()
  const bySubcategory = new Map<
    string,
    Totals & { audience: string; category: string; channel: string; subcategory: string }
  >()

  for (const row of rows) {
    if (!Number.isFinite(row.count) || row.count <= 0) continue
    add(total, row)
    add(byChannel.get(row.channel) ?? set(byChannel, row.channel), row)
    add(byCategory.get(row.category) ?? set(byCategory, row.category), row)
    const audience = row.audience ?? ''
    const key = `${row.category}\u0000${row.channel}\u0000${audience}\u0000${row.subcategory}`
    let entry = bySubcategory.get(key)
    if (entry === undefined) {
      entry = {
        audience,
        category: row.category,
        channel: row.channel,
        subcategory: row.subcategory,
        ...emptyTotals(),
      }
      bySubcategory.set(key, entry)
    }
    add(entry, row)
  }

  return {
    byCategory: [...byCategory.entries()]
      .map(([category, totals]) => ({ category, ...totals }))
      .sort(byTotalThen('category')),
    byChannel: [...byChannel.entries()]
      .map(([channel, totals]) => ({ channel, ...totals }))
      .sort(byTotalThen('channel')),
    bySubcategory: [...bySubcategory.values()]
      .sort(byTotalThen('subcategory'))
      .slice(0, MAX_SUBCATEGORIES),
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    unavailable: [...unavailable].sort(),
  }
}

function emptyTotals(): Totals {
  return { failed: 0, sent: 0, total: 0 }
}

function set(map: Map<string, Totals>, key: string): Totals {
  const totals = emptyTotals()
  map.set(key, totals)
  return totals
}

function add(totals: Totals, row: SentMessagesSourceRow): void {
  if (row.status === 'failed') totals.failed += row.count
  else totals.sent += row.count
  totals.total += row.count
}

/** Maior volume primeiro; o empate cai no nome, para a resposta não trocar de ordem entre duas leituras iguais. */
function byTotalThen<TKey extends string>(key: TKey) {
  return (left: Totals & Record<TKey, string>, right: Totals & Record<TKey, string>): number =>
    right.total - left.total || left[key].localeCompare(right[key])
}
