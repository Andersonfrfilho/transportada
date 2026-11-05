/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FieldReportResponse, StopEventStep } from './fieldReportResponse.service'

/** O aviso que a tela mostra depois de a API aceitar um toque de campo (spec 294 RF5). */
export type FieldReportNotice = Readonly<{
  /** A chave de idempotência do toque: é a identidade do aviso. */
  key: string
  kind: 'arrive' | 'deliver' | 'return'
  recordedTogether: readonly StopEventStep[]
}>

const NOTICE_KINDS: ReadonlySet<string> = new Set(['arrive', 'deliver', 'return'])

/** Sem nada a dizer (nenhuma etapa junto, ou toque que não é chegada/baixa), não há aviso. */
export function toFieldReportNotice(input: {
  readonly key: string
  readonly kind: string
  readonly response: FieldReportResponse | undefined
}): FieldReportNotice | undefined {
  const { key, kind, response } = input
  if (response === undefined || !NOTICE_KINDS.has(kind)) return undefined
  if (response.recordedTogether.length === 0) return undefined
  return {
    key,
    kind: kind as FieldReportNotice['kind'],
    recordedTogether: response.recordedTogether,
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
