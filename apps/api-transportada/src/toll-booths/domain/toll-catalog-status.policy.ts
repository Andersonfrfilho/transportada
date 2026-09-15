/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Se o catálogo de praças (`toll_booths`, spec 090) tem o que a rota precisa — política pura, sem
 * I/O: recebe o resumo já lido (`TollCatalogSummary`) e decide `empty` | `stale` | `current`.
 *
 * ⚠️ **`empty` não é "sem pedágio na rota".** Catálogo vazio é ausência de dado, e a tela que
 * confunde as duas coisas mente para o operador — "Sem pedágio no trajeto." quando o extract do OSM
 * nunca foi carregado na instalação.
 */
import type { TollCatalogSummary } from '../application/toll-booth.port.js'
import { TOLL_CATALOG_STALE_AFTER_DAYS } from './toll-catalog-status.constant.js'

export const TOLL_CATALOG_STATUSES = ['empty', 'stale', 'current'] as const
export type TollCatalogStatus = (typeof TOLL_CATALOG_STATUSES)[number]

export type TollCatalogStatusResult = Readonly<{
  observedOn: null | string
  status: TollCatalogStatus
}>

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function resolveTollCatalogStatus(input: {
  readonly staleAfterDays?: number
  readonly summary: TollCatalogSummary
  readonly today: Date
}): TollCatalogStatusResult {
  const { summary } = input

  if (summary.boothCount === 0 || summary.latestObservedOn === null) {
    return { observedOn: null, status: 'empty' }
  }

  const staleAfterDays = input.staleAfterDays ?? TOLL_CATALOG_STALE_AFTER_DAYS
  const ageInDays = resolveAgeInDays({ observedOn: summary.latestObservedOn, today: input.today })

  return {
    observedOn: summary.latestObservedOn,
    status: ageInDays > staleAfterDays ? 'stale' : 'current',
  }
}

function resolveAgeInDays(input: { readonly observedOn: string; readonly today: Date }): number {
  const observedOnUtc = Date.parse(`${input.observedOn}T00:00:00.000Z`)
  const todayUtc = Date.UTC(
    input.today.getUTCFullYear(),
    input.today.getUTCMonth(),
    input.today.getUTCDate(),
  )

  return Math.floor((todayUtc - observedOnUtc) / MILLISECONDS_PER_DAY)
}
