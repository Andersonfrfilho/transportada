/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripStop } from './driverTrip.types'
import type {
  FieldReportResponse,
  NextStopOffer,
  StopEventStep,
} from './fieldReportResponse.service'

/** O aviso que a tela mostra depois de a API aceitar um toque de campo (spec 294 RF5). */
export type FieldReportNotice = Readonly<{
  /** Spec 294 RF14: só `applied`/`suggested` dizem algo ao motorista (falha e "ignorado" ficam calados). */
  addressCorrection?: 'applied' | 'suggested'
  /** A chave de idempotência do toque: é a identidade do aviso. */
  key: string
  kind: 'arrive' | 'deliver' | 'return'
  /** Spec 294 RF11: a próxima parada, com "Iniciar rota" em destaque. */
  nextStop?: NextStopOffer
  recordedTogether: readonly StopEventStep[]
}>

const NOTICE_KINDS: ReadonlySet<string> = new Set(['arrive', 'deliver', 'return'])

/** Sem nada a dizer (nem etapa junto, nem próxima parada, nem correção de endereço), não há aviso. */
export function toFieldReportNotice(input: {
  readonly key: string
  readonly kind: string
  readonly response: FieldReportResponse | undefined
}): FieldReportNotice | undefined {
  const { key, kind, response } = input
  if (response === undefined || !NOTICE_KINDS.has(kind)) return undefined
  const { addressCorrection, nextStop, recordedTogether } = response
  const notableCorrection =
    addressCorrection === 'applied' || addressCorrection === 'suggested'
      ? addressCorrection
      : undefined
  if (recordedTogether.length === 0 && nextStop === undefined && notableCorrection === undefined) {
    return undefined
  }
  return {
    ...(notableCorrection === undefined ? {} : { addressCorrection: notableCorrection }),
    key,
    kind: kind as FieldReportNotice['kind'],
    ...(nextStop === undefined ? {} : { nextStop }),
    recordedTogether,
  }
}

export function appendFieldReportNotices(
  current: readonly FieldReportNotice[],
  additions: readonly FieldReportNotice[],
): readonly FieldReportNotice[] {
  const knownKeys = new Set(current.map((notice) => notice.key))
  return [...current, ...additions.filter((notice) => !knownKeys.has(notice.key))]
}

export function dismissFieldReportNotice(
  current: readonly FieldReportNotice[],
  key: string,
): readonly FieldReportNotice[] {
  return current.filter((notice) => notice.key !== key)
}

/** Spec 294 RF11: a oferta da próxima parada só vale enquanto a parada não saiu, não chegou e não fechou. */
export function isNextStopStillPending(
  trips: readonly Readonly<{ stops: readonly DriverTripStop[] }>[],
  stopId: string | undefined,
): boolean {
  if (stopId === undefined) return false
  const stop = trips.flatMap((trip) => trip.stops).find((item) => item.id === stopId)
  if (stop === undefined) return false
  return (
    stop.completedAt === null && stop.arrivedAt === null && (stop.enRouteSince ?? null) === null
  )
}
