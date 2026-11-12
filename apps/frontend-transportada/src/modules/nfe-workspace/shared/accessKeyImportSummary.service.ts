/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { LookupReason } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import type { AccessKeyLookupRow } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'

export type AccessKeyImportFilter = 'all' | 'alreadyInSystem' | 'imported' | 'refused'

export type AccessKeyImportSummary = Readonly<{
  alreadyInSystem: number
  imported: number
  /** Falhou, demorou demais ou deu erro: a chave segue desconhecida e precisa de nova tentativa. */
  notObtained: number
  /** Janela mais cedo (ISO) entre as notas na fila da SEFAZ. */
  nextWindowAt: null | string
  refused: number
  refusedByReason: Readonly<Partial<Record<LookupReason, number>>>
  /** Chaves distintas mais as leituras sem chave; a chave repetida não conta de novo. */
  scanned: number
  /** Conferindo no sistema ou buscando na SEFAZ. */
  searching: number
  unreadable: number
  waiting: number
}>

export const ACCESS_KEY_IMPORT_FILTERS: readonly AccessKeyImportFilter[] = [
  'all',
  'imported',
  'alreadyInSystem',
  'refused',
]

function isAlreadyInSystem(row: AccessKeyLookupRow): boolean {
  return row.state.kind === 'ready' && row.wasRegistered === true
}

function earliest(current: null | string, candidate: null | string): null | string {
  if (candidate === null || Number.isNaN(new Date(candidate).getTime())) return current
  if (current === null) return candidate
  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current
}

/**
 * As chaves desconhecidas (bipadas menos "já estavam" e ilegíveis) se repartem, em todo instante, em
 * importadas + buscando + na fila + recusadas + não obtidas: cada linha cai em exatamente um balde.
 */
export function summarizeAccessKeyImport(
  rows: readonly AccessKeyLookupRow[],
  unreadable: number,
): AccessKeyImportSummary {
  let alreadyInSystem = 0
  let imported = 0
  let notObtained = 0
  let nextWindowAt: null | string = null
  let refused = 0
  let searching = 0
  let waiting = 0
  const refusedByReason: Partial<Record<LookupReason, number>> = {}

  for (const row of rows) {
    const { state } = row
    if (isAlreadyInSystem(row)) alreadyInSystem += 1
    else if (state.kind === 'ready') imported += 1
    else if (state.kind === 'checking' || state.kind === 'searching') searching += 1
    else if (state.kind === 'waiting') {
      waiting += 1
      nextWindowAt = earliest(nextWindowAt, state.notBefore)
    } else if (state.kind === 'refused') {
      refused += 1
      refusedByReason[state.reason] = (refusedByReason[state.reason] ?? 0) + 1
    } else notObtained += 1
  }

  return {
    alreadyInSystem,
    imported,
    nextWindowAt,
    notObtained,
    refused,
    refusedByReason,
    scanned: rows.length + unreadable,
    searching,
    unreadable,
    waiting,
  }
}

export function filterAccessKeyImportRows(
  rows: readonly AccessKeyLookupRow[],
  filter: AccessKeyImportFilter,
): readonly AccessKeyLookupRow[] {
  switch (filter) {
    case 'all':
      return rows
    case 'alreadyInSystem':
      return rows.filter(isAlreadyInSystem)
    case 'imported':
      return rows.filter((row) => row.state.kind === 'ready' && !isAlreadyInSystem(row))
    case 'refused':
      return rows.filter((row) => row.state.kind === 'refused')
  }
}

export function isAccessKeyAlreadyInSystem(row: AccessKeyLookupRow): boolean {
  return isAlreadyInSystem(row)
}
