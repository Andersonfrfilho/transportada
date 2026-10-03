/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'

/**
 * Spec 234 D1: a nota mede o momento em que o evento nasceu no aparelho, corrigido pelo desvio do
 * relógio dele contra o servidor — a rede lenta não é culpa do motorista. O desvio é medido a cada
 * resposta bem-sucedida da API e carimbado no item da fila **na criação** (D2).
 */

/** O que o item da fila entrega ao envio: a hora do toque (crua, do aparelho) e o desvio daquele instante. */
export type EventClockStamp = Readonly<{ clockOffsetMs: number; tappedAt: string }>

/** Um relato indo para o envio, com o carimbo do item da fila — `stamp` obrigatório: esquecê-lo é erro de tipo. */
export type StampedReport<TReport extends DriverFieldReport = DriverFieldReport> = Readonly<{
  report: TReport
  stamp: EventClockStamp | undefined
}>

/** Ida e volta acima disto: o ponto médio deixa de valer (upload lento é assimétrico) e a medição é descartada. */
export const MAX_CLOCK_SAMPLE_ROUND_TRIP_MS = 5_000

/**
 * ⚠️ Os esquemas da API são `.strict()`: só estes aceitam `tappedAt`/`clockOffsetMs`, e mandá-los em
 * outro `kind` dá `400` e derruba o item. `depart`/`cancelDeparture` já levam `tappedAt` próprio
 * (spec 206), `dispatch` e `proofReceiver` não têm hora de evento, e a ocorrência de nota usa outra rota.
 */
export const CLOCK_FIELD_REPORT_KINDS = [
  'arrive',
  'deliver',
  'occurrence',
  'return',
  'stopOccurrencePhoto',
] as const satisfies readonly DriverFieldReport['kind'][]

export type ClockFieldReportKind = (typeof CLOCK_FIELD_REPORT_KINDS)[number]

export function acceptsClockFields(kind: DriverFieldReport['kind']): kind is ClockFieldReportKind {
  return (CLOCK_FIELD_REPORT_KINDS as readonly string[]).includes(kind)
}

/** Os campos que o corpo do relato ganha; vazio quando o `kind` não os aceita ou não há carimbo. */
export function buildClockFields(input: {
  readonly kind: DriverFieldReport['kind']
  readonly stamp: EventClockStamp | undefined
}): Readonly<{ clockOffsetMs?: number; tappedAt?: string }> {
  if (input.stamp === undefined || !acceptsClockFields(input.kind)) return {}
  return { clockOffsetMs: input.stamp.clockOffsetMs, tappedAt: input.stamp.tappedAt }
}

/** Item sem `clockOffsetMs` (criado sem desvio medido, ou antes da spec) não tem carimbo. */
export function toEventClockStamp(
  item: Readonly<{ clockOffsetMs?: number; createdAt: string }>,
): EventClockStamp | undefined {
  if (item.clockOffsetMs === undefined) return undefined
  return { clockOffsetMs: item.clockOffsetMs, tappedAt: item.createdAt }
}

/**
 * `desvio = hora do servidor − hora do aparelho`: positivo com o aparelho atrasado, e é o que a API
 * soma ao `tappedAt`. O `Date` do HTTP tem resolução de 1 s; o erro de até ±1 s é irrelevante para a
 * janela de 24 h do comprovante.
 */
export function computeClockOffsetMs(input: {
  readonly deviceNowMs: number
  readonly serverDateHeader: string | null
}): number | undefined {
  if (input.serverDateHeader === null) return undefined
  const serverMs = Date.parse(input.serverDateHeader)
  if (!Number.isFinite(serverMs)) return undefined
  return Math.round(serverMs - input.deviceNowMs)
}

export type ClockOffsetStore = Readonly<{
  read: () => number | undefined
  write: (offsetMs: number) => void
}>

/** Spec 234 D7: o desvio guardado vale 24 h; passado disso vale "nunca medido". */
export const CLOCK_OFFSET_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const CLOCK_OFFSET_STORAGE_KEY = 'transportada.driver.clock-offset.v1'

export type ClockOffsetStorage = Pick<Storage, 'getItem' | 'setItem'>

type StoredClockOffset = Readonly<{ measuredAt: number; offsetMs: number }>

function isStoredClockOffset(value: unknown): value is StoredClockOffset {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { readonly measuredAt?: unknown; readonly offsetMs?: unknown }
  return (
    typeof candidate.measuredAt === 'number' &&
    Number.isFinite(candidate.measuredAt) &&
    typeof candidate.offsetMs === 'number' &&
    Number.isSafeInteger(candidate.offsetMs)
  )
}

function readStoredClockOffset(storage: ClockOffsetStorage | null): StoredClockOffset | undefined {
  try {
    const raw = storage?.getItem(CLOCK_OFFSET_STORAGE_KEY)
    if (raw === null || raw === undefined) return undefined
    const parsed: unknown = JSON.parse(raw)
    return isStoredClockOffset(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isFresh(input: { readonly nowMs: number; readonly record: StoredClockOffset }): boolean {
  const ageMs = input.nowMs - input.record.measuredAt
  return ageMs >= 0 && ageMs <= CLOCK_OFFSET_MAX_AGE_MS
}

/**
 * Spec 234 D7: a última medição vai ao `localStorage` com o instante dela, lida **de forma síncrona** — o
 * hook lê o desvio ao enfileirar, e uma leitura assíncrona (IndexedDB) deixaria a primeira entrega do boot
 * sem ele. A leitura devolve `undefined` com registro malformado, vencido ou com `measuredAt` no futuro
 * do relógio atual (relógio mexido). Falha de armazenamento (cota, modo privado) deixa só a memória.
 */
export function createClockOffsetStore(
  options: Readonly<{ now?: () => number; storage?: ClockOffsetStorage | null }> = {},
): ClockOffsetStore {
  const now = options.now ?? Date.now
  const storage = options.storage ?? null
  let latest: StoredClockOffset | undefined
  return {
    read: () => {
      const record = latest ?? readStoredClockOffset(storage)
      if (record === undefined || !isFresh({ nowMs: now(), record })) return undefined
      return record.offsetMs
    },
    write: (offsetMs) => {
      latest = { measuredAt: now(), offsetMs }
      try {
        storage?.setItem(CLOCK_OFFSET_STORAGE_KEY, JSON.stringify(latest))
      } catch {
        // Falhar ao guardar só custa a próxima abertura sem rede; a medição desta sessão segue na memória.
      }
    },
  }
}

export function resolveClockOffsetStorage(): ClockOffsetStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Do aparelho, não da conta: o relógio é o mesmo para quem entrar depois, então não leva `subHash` e o
 * "Sair" não o apaga (o desvio não identifica ninguém, e some sozinho em 24 h).
 */
export const driverClockOffset: ClockOffsetStore = createClockOffsetStore({
  storage: resolveClockOffsetStorage(),
})
