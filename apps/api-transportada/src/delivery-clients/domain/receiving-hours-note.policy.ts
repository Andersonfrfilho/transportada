/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Horário de recebimento escrito pelo cliente no texto livre da nota (`infCpl`), lido para a janela
 * semanal do cliente de entrega (`delivery_client_windows`).
 *
 * Medido em 18/11/2026: cerca de 15% das notas (748 de 4 950 em produção) trazem o horário, quase
 * sempre no bloco "Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 11:00 E DAS
 * 13:00 AS 17:00 HORAS". Política pura, sem I/O: devolve a janela ou `null`.
 *
 * ⚠️ É conservadora de propósito: o `infCpl` é texto de terceiro, e janela errada trava ou libera a
 * entrega sem ninguém perceber. O que não for entendido com certeza (por exemplo "ATÉ AS 18:20", que
 * não diz quando abre) vira `null`, nunca um palpite.
 */

export type ReceivingWindowInterval = {
  /** `HH:MM:SS`, o formato que o Postgres devolve de uma coluna `time`. */
  readonly closesAt: string
  readonly opensAt: string
  /** 0 domingo … 6 sábado, a numeração de `delivery_client_windows.weekday`. */
  readonly weekday: number
}

/** Só os primeiros caracteres depois da palavra de recebimento: o `infCpl` pode ter milhares. */
const SEGMENT_MAX_LENGTH = 400
const DEFAULT_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  DOM: 0,
  DOMINGO: 0,
  QUA: 3,
  QUARTA: 3,
  QUI: 4,
  QUINTA: 4,
  SAB: 6,
  SABADO: 6,
  SEG: 1,
  SEGUNDA: 1,
  SEX: 5,
  SEXTA: 5,
  TER: 2,
  TERCA: 2,
}

const DAY_WORD =
  '(?:SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO|SEG|TER|QUA|QUI|SEX|SAB|DOM)(?:-?FEIRA)?S?'
const DAY_SPEC = `${DAY_WORD}(?:\\s+(?:A|ATE)\\s+${DAY_WORD}|(?:\\s*(?:,|E)\\s*${DAY_WORD})+)?`
const TIME = '(\\d{1,2})(?:(?::|\\s?H\\s?)(\\d{2}))?(?:\\s?(?:HORAS?|HRS?|HS|H)\\b)?'
const RANGE = `(DAS?\\s+)?${TIME}\\s*(?:AS|A|ATE|-)\\s*${TIME}`

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toTime(hours: string, minutes: string | undefined): string | null {
  const h = Number(hours)
  const m = minutes === undefined ? 0 : Number(minutes)
  if (h > 23 || m > 59) return null
  return `${pad(h)}:${pad(m)}:00`
}

function parseWeekdays(spec: string): readonly number[] {
  const words = [...spec.matchAll(new RegExp(DAY_WORD, 'g'))].map((match) => {
    const root = match[0].replace(/-?FEIRAS?$/, '').replace(/S$/, '')
    return WEEKDAY_INDEX[root] ?? WEEKDAY_INDEX[match[0].slice(0, 3)]
  })
  const known = words.filter((day): day is number => day !== undefined)
  if (known.length === 0) return []
  if (/\s(?:A|ATE)\s/.test(spec) && known.length === 2) {
    const [from, to] = known as [number, number]
    const days: number[] = []
    for (let day = from; ; day = (day + 1) % 7) {
      days.push(day)
      if (day === to) break
    }
    return days
  }
  return [...new Set(known)]
}

type Group = { days: readonly number[] | null; ranges: { closesAt: string; opensAt: string }[] }

/**
 * `null` quando a nota não traz um horário de recebimento entendível. A janela sai ordenada por dia e
 * abertura, sem repetição.
 */
export function parseReceivingHoursFromNote(
  text: string | null | undefined,
): readonly ReceivingWindowInterval[] | null {
  if (typeof text !== 'string' || text.length === 0) return null
  const normalized = normalize(text)
  const start = normalized.indexOf('RECEB')
  if (start === -1) return null

  let segment = normalized.slice(start, start + SEGMENT_MAX_LENGTH)
  /**
   * "FECHADO AS SEXTAS" já é o que a ausência de janela diz, e "ALMOCO 11H AS 13H" é o buraco, não
   * uma janela: ler adiante inventaria dia ou abriria o cliente no almoço.
   */
  const stopAt = segment.search(/FECHAD|ALMOC/)
  if (stopAt !== -1) segment = segment.slice(0, stopAt)

  const tokens: { index: number; kind: 'days' | 'range'; match: RegExpExecArray }[] = []
  for (const match of segment.matchAll(new RegExp(`\\b${DAY_SPEC}\\b`, 'g'))) {
    tokens.push({ index: match.index, kind: 'days', match })
  }
  for (const match of segment.matchAll(new RegExp(RANGE, 'g'))) {
    tokens.push({ index: match.index, kind: 'range', match })
  }
  tokens.sort((left, right) => left.index - right.index)

  const groups: Group[] = []
  let current: Group = { days: null, ranges: [] }
  for (const token of tokens) {
    if (token.kind === 'days') {
      const days = parseWeekdays(token.match[0])
      if (days.length === 0) continue
      if (current.ranges.length > 0) {
        groups.push(current)
        current = { days, ranges: [] }
      } else {
        current = { days, ranges: [] }
      }
      continue
    }
    const [raw, prefix, h1, m1, h2, m2] = token.match as unknown as [
      string,
      string | undefined,
      string,
      string | undefined,
      string,
      string | undefined,
    ]
    /** Sem o "DAS" na frente, um par de números soltos é qualquer coisa: exige `:` ou `H`. */
    if (prefix === undefined && !/[:H]/.test(raw)) continue
    const opensAt = toTime(h1, m1)
    const closesAt = toTime(h2, m2)
    if (opensAt === null || closesAt === null || opensAt >= closesAt) return null
    current.ranges.push({ closesAt, opensAt })
  }
  if (current.ranges.length > 0) groups.push(current)
  if (groups.length === 0) return null

  const windows = new Map<string, ReceivingWindowInterval>()
  for (const group of groups) {
    const ranges = group.ranges.toSorted((left, right) => left.opensAt.localeCompare(right.opensAt))
    for (let index = 1; index < ranges.length; index += 1) {
      if (ranges[index]!.opensAt < ranges[index - 1]!.closesAt) return null
    }
    for (const weekday of group.days ?? DEFAULT_WEEKDAYS) {
      for (const range of ranges) {
        windows.set(`${weekday}|${range.opensAt}|${range.closesAt}`, { ...range, weekday })
      }
    }
  }
  return [...windows.values()].toSorted(
    (left, right) => left.weekday - right.weekday || left.opensAt.localeCompare(right.opensAt),
  )
}

/** A mesma janela escrita de duas formas tem de dar a mesma chave. */
export function receivingWindowSignature(windows: readonly ReceivingWindowInterval[]): string {
  return windows.map((w) => `${w.weekday}:${w.opensAt}-${w.closesAt}`).join(';')
}

export type ConsolidatedReceivingWindow = {
  /** Quantas notas do cliente disseram exatamente a janela escolhida. */
  readonly supportingNotes: number
  readonly totalNotes: number
  readonly windows: readonly ReceivingWindowInterval[]
  /** Há notas do mesmo cliente com outra janela: o operador confere antes de gravar. */
  readonly conflicting: boolean
}

/**
 * O cliente aparece em várias notas, e elas podem divergir (carga com destinatários diferentes, texto
 * digitado à mão). Escolhe a janela mais citada e diz se houve divergência — quem grava decide o que
 * fazer com `conflicting`.
 */
export function consolidateReceivingWindows(
  candidates: readonly (readonly ReceivingWindowInterval[])[],
): ConsolidatedReceivingWindow | null {
  if (candidates.length === 0) return null
  const counts = new Map<string, { count: number; windows: readonly ReceivingWindowInterval[] }>()
  for (const windows of candidates) {
    const key = receivingWindowSignature(windows)
    const entry = counts.get(key)
    if (entry === undefined) counts.set(key, { count: 1, windows })
    else entry.count += 1
  }
  const [best] = [...counts.values()].toSorted((left, right) => right.count - left.count)
  if (best === undefined) return null
  return {
    conflicting: counts.size > 1,
    supportingNotes: best.count,
    totalNotes: candidates.length,
    windows: best.windows,
  }
}
